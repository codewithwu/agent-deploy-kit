"""密码哈希、JWT 签发/解码、refresh token 黑名单。"""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt
from jwt.exceptions import InvalidTokenError as _PyJWTInvalid
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from backend.auth.config import settings
from backend.auth.redis_client import get_redis

_pwd = PasswordHash((Argon2Hasher(),))


class TokenError(Exception):
    """JWT 验签/解码/类型不匹配时抛出。"""


def hash_password(plain: str) -> str:
    """用 Argon2 哈希明文密码。"""
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """验证明文密码与哈希匹配。"""
    return _pwd.verify(plain, hashed)


def _encode(payload: dict[str, Any]) -> str:
    """按 settings 中的算法/密钥把 payload 编码成 JWT 字符串。"""
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    """签发短期 access token。"""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(
            (now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()
        ),
    }
    return _encode(payload)


def create_refresh_token(user_id: int) -> tuple[str, str]:
    """签发长生命周期 refresh token，返回 (token, jti)。"""
    jti = uuid4().hex
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(
            (now + timedelta(days=settings.refresh_token_expire_days)).timestamp()
        ),
    }
    return _encode(payload), jti


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    """解码并校验 token：签名、type、exp。失败抛 TokenError。"""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_sub": False},
        )
    except _PyJWTInvalid as exc:
        raise TokenError(str(exc)) from exc

    if payload.get("type") != expected_type:
        raise TokenError(
            f"expected type {expected_type!r}, got {payload.get('type')!r}"
        )
    return payload


async def is_refresh_blacklisted(jti: str) -> bool:
    """检查 refresh jti 是否在黑名单。"""
    return await get_redis().exists(f"blacklist:refresh:{jti}") > 0


async def blacklist_refresh(jti: str, ttl_seconds: int) -> None:
    """把 refresh jti 写入黑名单，ttl_seconds 为该 token 剩余生命周期。"""
    if ttl_seconds <= 0:
        return  # 已过期，无须写
    await get_redis().set(f"blacklist:refresh:{jti}", "1", ex=ttl_seconds)
