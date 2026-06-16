"""测试套件全局配置：默认 env + auth fixture。"""

import os

os.environ.setdefault("AGENT_NAME", "code_agent")
os.environ.setdefault("JWT_SECRET", "test-secret-32-bytes-min-padding-xx")
os.environ.setdefault("REDIS_URL", "redis://:158168@localhost:6379/0")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/app")
os.environ.setdefault("DATABASE_ASYNC_URL", "postgresql+asyncpg://postgres:123456@localhost:5432/app")

import asyncio
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from backend.db.async_session import DATABASE_ASYNC_URL
from backend.main import app


@pytest.fixture(scope="session")
def event_loop():
    """session 范围 event loop，供 pytest-asyncio 异步 fixture 使用。"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def clean_db() -> AsyncIterator[None]:
    """每个用例清空 users 与 user_roles（仅 auth 表；不破坏 chat 相关表）。"""
    assert DATABASE_ASYNC_URL is not None
    engine = create_async_engine(DATABASE_ASYNC_URL)
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE"))
        await conn.execute(text("TRUNCATE TABLE user_roles RESTART IDENTITY CASCADE"))
    await engine.dispose()
    yield


@pytest_asyncio.fixture
async def client(clean_db) -> AsyncIterator[AsyncClient]:
    """启动 app lifespan，返 httpx AsyncClient。"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
