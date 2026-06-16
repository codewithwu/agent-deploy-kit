"""Weather Agent FastAPI 后端."""

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import BaseMessage
from starlette.types import ExceptionHandler

from backend.agent_loader import get_agent
from backend.auth.config import settings as auth_settings  # noqa: F401  启动期校验 JWT_SECRET
from backend.auth.redis_client import close_redis, init_redis
from backend.auth import (
    router as auth_router,
    token_error_handler,
    validation_exception_handler,
)
from backend.auth import security
from backend.schemas import ChatRequest, ChatResponse, HealthResponse

logger = logging.getLogger(__name__)

agent = get_agent()  # 启动期主动加载；env/模块错误在此抛出


def _sse(event: str, data: object, *, id: str | None = None) -> str:
    # SSE 单事件块:可选 id 行 + event 行 + data 行,行尾 \n,块间空行。
    parts: list[str] = []
    if id is not None:
        parts.append(f"id: {id}\n")
    parts.append(f"event: {event}\n")
    parts.append(f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n")
    return "".join(parts)


async def event_generator(request: ChatRequest) -> AsyncIterator[bytes]:
    # 流中异常类型不可控(LLM SDK / LangChain 内部),边界代码用 except Exception
    # 并强制 logging.exception 留痕,响应头已发出故不再 raise(详见 spec 错误处理段)。
    try:
        for chunk in agent.stream(
            {"messages": [m.model_dump() for m in request.messages]},
            stream_mode="updates",
            version="v2",
        ):
            if chunk.get("type") != "updates":
                continue
            updates = cast(dict[str, object], chunk["data"])
            for step, data in updates.items():
                state = cast(dict[str, list[BaseMessage]], data)
                blocks = state["messages"][-1].content_blocks
                yield _sse(
                    "step",
                    {"step": step, "blocks": blocks},
                    id=uuid4().hex,
                ).encode("utf-8")
        yield _sse("done", {}).encode("utf-8")
    except Exception as exc:
        logger.exception("chat_stream agent raised")
        yield _sse("error", {"detail": str(exc)}).encode("utf-8")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # lifespan:启动期初始化 Redis 连接池,关闭期优雅释放。
    await init_redis()
    yield
    await close_redis()


app = FastAPI(title="Weather Agent API", version="0.1.0", lifespan=lifespan)

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


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    try:
        result = agent.invoke({"messages": [m.model_dump() for m in request.messages]})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    messages = result.get("messages", [])
    if not messages:
        raise HTTPException(status_code=500, detail="agent returned no messages")

    reply = getattr(messages[-1], "content", "")
    return ChatResponse(reply=reply)


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


app.include_router(auth_router, prefix="/api/auth")
