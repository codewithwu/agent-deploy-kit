"""聊天路由：POST /api/chat 与 POST /api/chat/stream。"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.agent_loader import get_agent
from backend.chat.streaming import event_generator
from backend.schemas import ChatRequest, ChatResponse

agent = get_agent()  # 启动期主动加载；env/模块错误在此抛出

router = APIRouter()


@router.post("", response_model=ChatResponse)
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


@router.post("/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
