"""SSE 流式聊天响应拼装与 agent 流遍历。"""

import json
import logging
from collections.abc import AsyncIterator
from typing import cast
from uuid import uuid4

from langchain_core.messages import BaseMessage

from backend.agent_loader import get_agent
from backend.schemas import ChatRequest

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
