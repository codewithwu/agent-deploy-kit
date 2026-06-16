"""认证业务逻辑：纯函数，输入 session/redis，返领域结果或抛业务异常。

不依赖 FastAPI，便于单测。
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import security
from backend.auth.config import settings
from backend.auth.schemas import UserOut
from backend.models import User, UserRole

__all__ = [
    "UsernameTaken",
    "EmailTaken",
    "InvalidCredentials",
    "InvalidToken",
    "UserInactive",
    "WrongPassword",
    "LoginResult",
    "RefreshResult",
    "register",
    "login",
    "logout",
    "refresh",
    "change_password",
    "delete_me",
]


# --- 业务异常 ---


class UsernameTaken(Exception):
    """注册时 username 已被占用。"""


class EmailTaken(Exception):
    """注册时 email 已被占用。"""


class InvalidCredentials(Exception):
    """登录时用户名或密码错误（统一文案防枚举）。"""


class UserInactive(Exception):
    """登录时账号已停用。"""


class InvalidToken(Exception):
    """refresh token 无效/过期/被吊销。"""


class WrongPassword(Exception):
    """改密/注销时旧密码错误。"""


# --- 领域结果 ---


@dataclass
class LoginResult:
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserOut


@dataclass
class RefreshResult:
    access_token: str
    refresh_token: str
    expires_in: int


# --- 业务函数 ---


async def register(db: AsyncSession, username: str, email: str, password: str) -> User:
    """注册新用户。username/email 已存在抛 UsernameTaken/EmailTaken。"""
    user = User(
        username=username,
        email=email,
        hashed_password=security.hash_password(password),
        role="user",
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        # 区分 username / email 唯一冲突：按列名判定
        msg = str(exc.orig).lower()
        if "username" in msg:
            raise UsernameTaken(username) from exc
        if "email" in msg:
            raise EmailTaken(email) from exc
        raise  # 其他完整性错误透传

    db.add(UserRole(user_id=user.id, role="user"))
    await db.commit()
    await db.refresh(user)
    return user


async def login(db: AsyncSession, identifier: str, password: str) -> LoginResult:
    """登录：identifier 接受 username 或 email。

    查询不带 is_active 过滤，先做凭证校验再判断停用，避免把"账号停用"
    与"用户不存在"混为同一类错误（便于前端给出准确提示）。
    """
    user = (
        await db.execute(
            select(User).where(
                or_(User.username == identifier, User.email == identifier),
            )
        )
    ).scalar_one_or_none()

    if user is None or not security.verify_password(password, user.hashed_password):
        # 不区分"用户不存在"与"密码错"——统一抛 InvalidCredentials 防枚举
        raise InvalidCredentials()
    if not user.is_active:
        raise UserInactive()

    access_token = security.create_access_token(user.id)
    refresh_token, _ = security.create_refresh_token(user.id)

    return LoginResult(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=_to_user_out(user),
    )


async def logout(jti: str, ttl_seconds: int) -> None:
    """把当前 refresh jti 写黑名单。"""
    await security.blacklist_refresh(jti, ttl_seconds)


async def refresh(db: AsyncSession, refresh_token_str: str) -> RefreshResult:
    """用 refresh token 换新的 access+refresh（rotating）。旧 refresh 进黑名单。"""
    try:
        payload = security.decode_token(refresh_token_str, expected_type="refresh")
    except security.TokenError as exc:
        raise InvalidToken(str(exc)) from exc
    jti = payload.get("jti", "")
    if not jti or await security.is_refresh_blacklisted(jti):
        raise InvalidToken("refresh revoked")

    user_id = int(payload["sub"])
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise InvalidToken("user not found or inactive")

    # 计算旧 refresh 剩余 TTL
    exp = payload.get("exp")
    if exp is None:
        raise InvalidToken("missing exp")
    now_ts = int(datetime.now(timezone.utc).timestamp())
    ttl = max(0, int(exp) - now_ts)
    await security.blacklist_refresh(jti, ttl)

    new_access = security.create_access_token(user.id)
    new_refresh, _ = security.create_refresh_token(user.id)
    return RefreshResult(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


async def change_password(
    db: AsyncSession,
    user: User,
    old_password: str,
    new_password: str,
    current_refresh_jti: str | None,
) -> None:
    """改密：校验旧密码 → 更新 hashed_password → 吊销当前 refresh（jti 透传）。"""
    if not security.verify_password(old_password, user.hashed_password):
        raise WrongPassword("old password incorrect")
    user.hashed_password = security.hash_password(new_password)
    await db.commit()
    await db.refresh(user)
    if current_refresh_jti:
        # 重新查 exp 困难；用 refresh_token 默认剩余寿命作 TTL 上限
        await security.blacklist_refresh(
            current_refresh_jti, settings.refresh_token_expire_days * 24 * 3600
        )


async def delete_me(db: AsyncSession, user: User, password: str) -> None:
    """软删：is_active=false。"""
    if not security.verify_password(password, user.hashed_password):
        raise WrongPassword("password incorrect")
    user.is_active = False
    await db.commit()
    await db.refresh(user)


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at or datetime.now(timezone.utc),
    )
