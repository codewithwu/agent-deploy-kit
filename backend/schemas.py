"""Pydantic 请求/响应模型。"""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class ChatMessage(BaseModel):
    role: str = "user"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
