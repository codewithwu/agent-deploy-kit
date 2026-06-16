"""Weather Agent FastAPI 后端。"""

from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ExceptionHandler

from backend.auth.config import settings as auth_settings  # noqa: F401  启动期校验 JWT_SECRET
from backend.auth.redis_client import close_redis, init_redis
from backend.auth import (
    router as auth_router,
    token_error_handler,
    validation_exception_handler,
)
from backend.auth import security
from backend.chat import router as chat_router
from backend.schemas import HealthResponse


@asynccontextmanager
async def lifespan(_: FastAPI):
    # lifespan:启动期初始化 Redis 连接池,关闭期优雅释放。
    await init_redis()
    yield
    await close_redis()


app = FastAPI(title="Agent API", version="0.1.0", lifespan=lifespan)

# 全局 Pydantic 校验异常处理器,把 FastAPI 默认的 422 转换为 400(详见 backend/auth)。
# Starlette 的 add_exception_handler 期望 (Request, Exception),此处用 RequestValidationError 子类;
# 通过 cast 把处理器签名拓宽为 Starlette 期望的形式,既消除 mypy 报错又保持运行期类型安全。
app.add_exception_handler(
    RequestValidationError,
    cast(ExceptionHandler, validation_exception_handler),
)
# 把 auth/security.TokenError 转 401（get_current_user 抛出的鉴权失败）。
app.add_exception_handler(
    security.TokenError,
    cast(ExceptionHandler, token_error_handler),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


app.include_router(auth_router, prefix="/api/auth")
app.include_router(chat_router, prefix="/api/chat")
