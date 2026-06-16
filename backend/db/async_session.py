"""异步数据库会话管理（与同步 session.py 并存）。

异步路由依赖注入用 get_async_db；同步路由继续用 session.py 的 get_db。
"""

import os
from collections.abc import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

load_dotenv()

DATABASE_ASYNC_URL = os.getenv("DATABASE_ASYNC_URL")
if not DATABASE_ASYNC_URL:
    raise RuntimeError("DATABASE_ASYNC_URL 未设置")

async_engine: AsyncEngine = create_async_engine(DATABASE_ASYNC_URL, pool_pre_ping=True)
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=async_engine,
    expire_on_commit=False,
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """获取异步数据库会话（依赖注入用）。"""
    async with AsyncSessionLocal() as session:
        yield session
