"""Weather Agent FastAPI 后端."""

import json
import logging
from collections.abc import AsyncIterator
from typing import cast
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import BaseMessage

from agents.weather_agent import weather_agent
from backend.schemas import ChatRequest, ChatResponse, HealthResponse

logger = logging.getLogger(__name__)


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
        for chunk in weather_agent.stream(
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


app = FastAPI(title="Weather Agent API", version="0.1.0")

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
        result = weather_agent.invoke(
            {"messages": [m.model_dump() for m in request.messages]}
        )
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
