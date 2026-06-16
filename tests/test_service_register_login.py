"""service.register / service.login 单元测试，使用 SQLite 内存数据库隔离。"""

from typing import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.auth import service
from backend.db.base import Base
from backend.models import UserRole


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """每个用例一个临时 SQLite 内存库。"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with Session() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_register_creates_user_and_role(db_session: AsyncSession) -> None:
    user = await service.register(
        db_session, username="alice", email="a@b.com", password="Hello12345"
    )
    assert user.id is not None
    assert user.username == "alice"
    assert user.role == "user"

    roles = (
        await db_session.execute(
            UserRole.__table__.select().where(UserRole.user_id == user.id)
        )
    ).all()
    assert len(roles) == 1


@pytest.mark.asyncio
async def test_register_duplicate_username_raises(db_session: AsyncSession) -> None:
    await service.register(db_session, "alice", "a@b.com", "Hello12345")
    with pytest.raises(service.UsernameTaken):
        await service.register(db_session, "alice", "other@b.com", "Hello12345")


@pytest.mark.asyncio
async def test_register_duplicate_email_raises(db_session: AsyncSession) -> None:
    await service.register(db_session, "alice", "a@b.com", "Hello12345")
    with pytest.raises(service.EmailTaken):
        await service.register(db_session, "bob", "a@b.com", "Hello12345")


@pytest.mark.asyncio
async def test_login_success_returns_tokens(db_session: AsyncSession) -> None:
    await service.register(db_session, "alice", "a@b.com", "Hello12345")
    result = await service.login(db_session, "alice", "Hello12345")
    assert result.access_token
    assert result.refresh_token
    assert result.user.username == "alice"
    assert result.user.role == "user"


@pytest.mark.asyncio
async def test_login_with_email(db_session: AsyncSession) -> None:
    await service.register(db_session, "alice", "a@b.com", "Hello12345")
    result = await service.login(db_session, "a@b.com", "Hello12345")
    assert result.user.username == "alice"


@pytest.mark.asyncio
async def test_login_wrong_password_raises(db_session: AsyncSession) -> None:
    await service.register(db_session, "alice", "a@b.com", "Hello12345")
    with pytest.raises(service.InvalidCredentials):
        await service.login(db_session, "alice", "WrongPass1")


@pytest.mark.asyncio
async def test_login_unknown_user_raises(db_session: AsyncSession) -> None:
    with pytest.raises(service.InvalidCredentials):
        await service.login(db_session, "nobody", "Hello12345")


@pytest.mark.asyncio
async def test_login_inactive_user_raises(db_session: AsyncSession) -> None:
    user = await service.register(db_session, "alice", "a@b.com", "Hello12345")
    user.is_active = False
    await db_session.commit()
    with pytest.raises(service.UserInactive):
        await service.login(db_session, "alice", "Hello12345")
