"""异步 Redis 客户端：启动期 ping 失败立即 RuntimeError。"""

import redis.asyncio as redis_async
from redis.asyncio import Redis

from backend.auth.config import settings

_client: Redis | None = None


def get_redis() -> Redis:
    """获取 Redis 客户端单例。"""
    if _client is None:
        raise RuntimeError("Redis client not initialized; call init_redis() first")
    return _client


async def init_redis() -> None:
    """启动期初始化 Redis 客户端并 ping 一次。"""
    global _client
    _client = redis_async.from_url(settings.redis_url, decode_responses=True)
    await _client.ping()  # 失败 → ConnectionError，进程退出


async def close_redis() -> None:
    """关闭 Redis 连接（FastAPI lifespan 收尾用）。"""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
