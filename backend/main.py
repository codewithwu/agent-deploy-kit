"""Weather Agent FastAPI 后端."""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from agents.weather_agent import weather_agent


class HealthResponse(BaseModel):
    status: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str


app = FastAPI(title="Weather Agent API", version="0.1.0")


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

    reply = getattr(messages[-1], "content", "") or ""
    return ChatResponse(reply=reply)
