"""Weather Agent FastAPI 后端."""

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from agents.weather_agent import weather_agent
from backend.schemas import ChatRequest, ChatResponse, HealthResponse

logger = logging.getLogger(__name__)

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
    # Task 1 阶段先返回空 body,仅验证响应头与 400 路径;
    # Task 2 会把 body 换成消费 weather_agent.stream 的 async generator。
    return StreamingResponse(
        iter([]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
