"""security.py 单元测试。"""

import os
import time
from importlib import reload

import pytest
import pytest_asyncio

from backend.auth import security
from backend.auth.config import settings
from backend.auth.redis_client import close_redis, init_redis


@pytest_asyncio.fixture(autouse=True)
async def _ensure_redis():
    """每次测试前确保 Redis 客户端初始化；测试后清理连接。"""
    await init_redis()
    yield
    await close_redis()


@pytest.fixture
def reset_redis():
    """每个用例前后清空 blacklisted 前缀的 key。"""
    yield
    # teardown: 测试结束后清；用 sync 客户端即可，hiredis 已装
    import redis

    sync = redis.from_url(settings.redis_url, decode_responses=True)
    for k in sync.scan_iter("blacklist:refresh:*"):
        sync.delete(k)
    sync.close()


def test_hash_and_verify_password_roundtrip():
    """哈希与验签应一致；错误密码应被拒。"""
    hashed = security.hash_password("Hello12345")
    assert hashed != "Hello12345"
    assert security.verify_password("Hello12345", hashed) is True
    # 错误密码应返回 False
    assert security.verify_password("WrongPass1", hashed) is False


def test_hash_password_uses_argon2():
    """哈希串应以 $argon2 开头，确认走的是 Argon2 算法。"""
    hashed = security.hash_password("Hello12345")
    assert hashed.startswith("$argon2")


def test_create_access_token_returns_string():
    """access token 应是 3 段 JWT。"""
    token = security.create_access_token(user_id=42)
    assert isinstance(token, str)
    parts = token.split(".")
    assert len(parts) == 3  # header.payload.sig


def test_create_refresh_token_returns_token_and_jti():
    """refresh token 应同时返回 jti（uuid4 hex 长度 32）。"""
    token, jti = security.create_refresh_token(user_id=42)
    assert isinstance(token, str)
    assert isinstance(jti, str)
    assert len(jti) == 32  # uuid4().hex


def test_decode_access_token_returns_payload():
    """解码 access token 后 sub / type 字段应符合预期。"""
    token = security.create_access_token(user_id=7)
    payload = security.decode_token(token, expected_type="access")
    assert payload["sub"] == 7
    assert payload["type"] == "access"


def test_decode_token_wrong_type_raises():
    """用 refresh token 当 access 用应抛 TokenError。"""
    token, _ = security.create_refresh_token(user_id=7)
    with pytest.raises(security.TokenError):
        security.decode_token(token, expected_type="access")


def test_decode_token_invalid_signature_raises():
    """非法 token 串应抛 TokenError。"""
    with pytest.raises(security.TokenError):
        security.decode_token("not.a.valid.jwt", expected_type="access")


def test_decode_token_expired_raises():
    """构造一个已过期的 access token（直接改 settings 后签发）。"""
    # 临时改 expire
    saved = os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES")
    os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "-1"  # 立即过期
    try:
        # AuthSettings 缓存了旧值；重读
        from backend.auth import config as cfg

        reload(cfg)
        reload(security)
        token = security.create_access_token(user_id=1)
        with pytest.raises(security.TokenError):
            security.decode_token(token, expected_type="access")
    finally:
        if saved is None:
            os.environ.pop("ACCESS_TOKEN_EXPIRE_MINUTES", None)
        else:
            os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = saved
        reload(cfg)
        reload(security)


async def test_blacklist_and_check_refresh(reset_redis):
    """写入黑名单后 is_blacklisted 应返 True。"""
    _, jti = security.create_refresh_token(user_id=1)
    assert await security.is_refresh_blacklisted(jti) is False
    await security.blacklist_refresh(jti, ttl_seconds=60)
    assert await security.is_refresh_blacklisted(jti) is True


async def test_blacklist_with_zero_ttl_expires_immediately(reset_redis):
    """TTL=0 应被实现跳过写入；稍后检查应 False。"""
    _, jti = security.create_refresh_token(user_id=1)
    await security.blacklist_refresh(jti, ttl_seconds=0)
    # TTL=0 立即过期 → is_blacklisted 应返 False
    time.sleep(0.05)
    assert await security.is_refresh_blacklisted(jti) is False
