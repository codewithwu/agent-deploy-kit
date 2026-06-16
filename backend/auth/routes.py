"""认证路由层：FastAPI 端点 + 限速 + 422→400 异常处理器。"""

from collections import deque
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import security, service
from backend.auth.config import settings
from backend.auth.deps import get_current_user
from backend.auth.schemas import (
    ChangePasswordIn,
    DeleteMeIn,
    LoginIn,
    LoginOut,
    RegisterIn,
    RegisterOut,
    TokenPairOut,
    UserOut,
    VerifyOut,
)
from backend.db.async_session import get_async_db
from backend.models import User

router = APIRouter(tags=["auth"])

# 简易内存限速：key=ip, value=deque[timestamp]
_login_attempts: dict[str, deque[float]] = {}


def _check_rate_limit(ip: str) -> None:
    """超过每分钟 N 次失败尝试 → 429。"""
    import time

    now = time.time()
    window: deque[float] = _login_attempts.setdefault(ip, deque())
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= settings.login_rate_limit_per_min:
        raise HTTPException(status_code=429, detail="尝试过于频繁，请稍后再试")
    window.append(now)


async def validation_exception_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    """把 Pydantic 422 转 400 + 字段错误列表。

    模块级函数，由 main.py 在创建 FastAPI app 后通过
    `app.add_exception_handler(RequestValidationError, validation_exception_handler)`
    注册到全局 app。
    """
    return JSONResponse(
        status_code=400,
        content={"detail": "参数错误", "errors": exc.errors()},
    )


@router.post("/register", response_model=RegisterOut, status_code=201)
async def register(
    body: RegisterIn,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> RegisterOut:
    try:
        user = await service.register(db, body.username, body.email, body.password)
    except service.UsernameTaken:
        raise HTTPException(status_code=409, detail="用户名已被使用") from None
    except service.EmailTaken:
        raise HTTPException(status_code=409, detail="邮箱已被使用") from None
    return RegisterOut(
        user_id=user.id, username=user.username, email=user.email, role=user.role
    )


@router.post("/login", response_model=LoginOut)
async def login(
    request: Request,
    body: LoginIn,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> LoginOut:
    _check_rate_limit(request.client.host if request.client else "unknown")
    try:
        result = await service.login(db, body.username, body.password)
    except (service.InvalidCredentials, service.UserInactive):
        # 防枚举：统一文案
        raise HTTPException(status_code=401, detail="用户名或密码错误") from None
    return LoginOut(
        access_token=result.access_token,
        refresh_token=result.refresh_token,
        expires_in=result.expires_in,
        user=result.user,
    )


@router.post("/logout", status_code=204)
async def logout(
    _user: Annotated[User, Depends(get_current_user)],
) -> None:
    """把当前 access token 对应用户最近一次 refresh 进黑名单。

    简化：access token 无 jti，因此仅作依赖校验（get_current_user），
    不真正撤销任何 token。前端应同时丢弃本地 access/refresh。
    返回 204 即视为已"退出登录"。
    """
    return None


@router.post("/refresh", response_model=TokenPairOut)
async def refresh(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> TokenPairOut:
    """从 Authorization header 抽 refresh token 换新 access+refresh。"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="认证失败")
    token = authorization.split(" ", 1)[1].strip()
    try:
        result = await service.refresh(db, token)
    except service.InvalidToken:
        raise HTTPException(status_code=401, detail="认证失败") from None
    return TokenPairOut(
        access_token=result.access_token,
        refresh_token=result.refresh_token,
        expires_in=result.expires_in,
    )


@router.get("/verify", response_model=VerifyOut)
async def verify(
    user: Annotated[User, Depends(get_current_user)],
) -> VerifyOut:
    return VerifyOut(
        valid=True,
        user=UserOut(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at or datetime.now(timezone.utc),
        ),
    )


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at or datetime.now(timezone.utc),
    )


@router.patch("/me/password", status_code=204)
async def change_password(
    body: ChangePasswordIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """改密。client 需把 refresh token 放在 Authorization header（与 logout 一致简化）。"""
    refresh_jti: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = security.decode_token(token, expected_type="refresh")
            refresh_jti = payload.get("jti")
        except security.TokenError:
            pass  # 改密仍允许通过，仅无法吊销
    try:
        await service.change_password(
            db, user, body.old_password, body.new_password, refresh_jti
        )
    except service.WrongPassword:
        raise HTTPException(status_code=401, detail="密码错误") from None


@router.delete("/me", status_code=204)
async def delete_me(
    body: DeleteMeIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> None:
    try:
        await service.delete_me(db, user, body.password)
    except service.WrongPassword:
        raise HTTPException(status_code=401, detail="密码错误") from None
