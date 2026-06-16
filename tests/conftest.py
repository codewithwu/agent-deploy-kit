"""测试套件全局配置：默认 env + auth fixture。"""

import os

os.environ.setdefault("AGENT_NAME", "code_agent")
os.environ.setdefault("JWT_SECRET", "test-secret-32-bytes-min-padding-xx")
os.environ.setdefault("REDIS_URL", "redis://:158168@localhost:6379/0")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/app")
os.environ.setdefault(
    "DATABASE_ASYNC_URL",
    "postgresql+asyncpg://postgres:123456@localhost:5432/app",
)

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from backend.auth.redis_client import close_redis, init_redis
from backend.db.async_session import DATABASE_ASYNC_URL
from backend.main import app


@pytest_asyncio.fixture(scope="session")
async def _engine() -> AsyncIterator[AsyncEngine]:
    """session 范围 engine：避免每用例重建连接池导致 asyncpg 跨 loop 泄漏。"""
    assert DATABASE_ASYNC_URL is not None
    engine = create_async_engine(DATABASE_ASYNC_URL)
    yield engine
    await engine.dispose()


@pytest.fixture(autouse=True)
def _reset_login_rate_limiter() -> None:
    """每个用例清空 _login_attempts 内存限速器。

    限速器是模块级单例（按 IP 计数），不在用例间共享状态会导致顺序跑用例时
    login 失败计数累积，触发 429。
    """
    from backend.auth import routes

    routes._login_attempts.clear()  # type: ignore[attr-defined]


@pytest_asyncio.fixture
async def clean_db(_engine: AsyncEngine) -> AsyncIterator[None]:
    """每个用例清空 users 与 user_roles（仅 auth 表；不破坏 chat 相关表）。"""
    async with _engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE"))
        await conn.execute(text("TRUNCATE TABLE user_roles RESTART IDENTITY CASCADE"))
    yield


@pytest_asyncio.fixture
async def client(clean_db) -> AsyncIterator[AsyncClient]:
    """启动 app lifespan，返 httpx AsyncClient。

    httpx.ASGITransport 不会触发 FastAPI lifespan，所以这里手动调
    init_redis()/close_redis() 复刻 lifespan 行为，避免 get_redis() 抛 RuntimeError。
    """
    await init_redis()
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac
    finally:
        await close_redis()
