"""FastAPI 依赖：鉴权与角色守卫。"""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import security
from backend.auth.config import settings  # noqa: F401  显式 import 让 settings 在 import 期就校验
from backend.auth.redis_client import get_redis  # noqa: F401  预热 redis 客户端模块
from backend.db.async_session import get_async_db
from backend.models import User


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_async_db),
) -> User:
    """从 Authorization: Bearer <token> 解 access token 并加载 User。

    不强制 is_active：软删用户仍可调 /me，由前端决定是否跳登录。
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise security.TokenError("missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = security.decode_token(token, expected_type="access")

    if await _is_access_revoked(payload):
        raise security.TokenError("token revoked")

    user_id = int(payload["sub"])
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise security.TokenError("user not found")
    return user


async def _is_access_revoked(payload: dict[str, Any]) -> bool:
    """access token 没有 jti，因此只在 refresh 被黑名单且 sub 一致时判无效。

    首版简化：access token 仅按 exp 失效；撤销靠 refresh 黑名单。
    这里保留 hook 留给将来扩展（access 黑名单 / ver 字段）。
    """
    return False


def require_role(*allowed: str) -> Callable[..., Coroutine[Any, Any, User]]:
    """依赖工厂：返回闭包，user.role 不在 allowed 列表则 403。"""

    async def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in allowed:
            from fastapi import HTTPException

            raise HTTPException(status_code=403, detail="权限不足")
        return user

    return _dep
