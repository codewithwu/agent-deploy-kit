"""service.logout / refresh / change_password / delete_me 单元测试。"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    async_sessionmaker,
    create_async_engine,
)

from backend.auth import security, service
from backend.auth.redis_client import close_redis, init_redis
from backend.db.base import Base


@pytest_asyncio.fixture(autouse=True)
async def _ensure_redis():
    """每个用例前确保 Redis 客户端初始化；用例后关闭。"""
    await init_redis()
    yield
    await close_redis()


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with Session() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def registered_user(db_session):
    user = await service.register(db_session, "alice", "a@b.com", "Hello12345")
    return user


@pytest.mark.asyncio
async def test_logout_blacklists_refresh(db_session, registered_user) -> None:
    _, jti = security.create_refresh_token(registered_user.id)
    await service.logout(jti, ttl_seconds=60)
    assert await security.is_refresh_blacklisted(jti) is True


@pytest.mark.asyncio
async def test_refresh_rotates_tokens(db_session, registered_user) -> None:
    old_refresh, old_jti = security.create_refresh_token(registered_user.id)
    result = await service.refresh(db_session, old_refresh)
    assert result.access_token
    assert result.refresh_token
    # 旧 refresh 已被黑名单
    assert await security.is_refresh_blacklisted(old_jti) is True


@pytest.mark.asyncio
async def test_refresh_with_blacklisted_token_raises(
    db_session, registered_user
) -> None:
    refresh, jti = security.create_refresh_token(registered_user.id)
    await service.logout(jti, ttl_seconds=60)
    with pytest.raises(service.InvalidToken):
        await service.refresh(db_session, refresh)


@pytest.mark.asyncio
async def test_refresh_with_access_token_raises(db_session, registered_user) -> None:
    access = security.create_access_token(registered_user.id)
    with pytest.raises(service.InvalidToken):
        await service.refresh(db_session, access)


@pytest.mark.asyncio
async def test_change_password_invalidates_current_refresh(
    db_session, registered_user
) -> None:
    _, jti = security.create_refresh_token(registered_user.id)
    await service.change_password(
        db_session, registered_user, "Hello12345", "NewPass1234", jti
    )
    assert await security.is_refresh_blacklisted(jti) is True


@pytest.mark.asyncio
async def test_change_password_wrong_old_raises(db_session, registered_user) -> None:
    with pytest.raises(service.WrongPassword):
        await service.change_password(
            db_session, registered_user, "WrongPass1", "NewPass1234", None
        )


@pytest.mark.asyncio
async def test_delete_me_soft_deletes(db_session, registered_user) -> None:
    await service.delete_me(db_session, registered_user, "Hello12345")
    await db_session.refresh(registered_user)
    assert registered_user.is_active is False


@pytest.mark.asyncio
async def test_delete_me_wrong_password_raises(db_session, registered_user) -> None:
    with pytest.raises(service.WrongPassword):
        await service.delete_me(db_session, registered_user, "WrongPass1")
