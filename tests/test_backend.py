"""Backend 端到端烟测。"""

import json
from typing import cast

from fastapi.testclient import TestClient

from backend.main import app


def test_health() -> None:
    """GET /health 返回 200 与 {"status": "ok"}。"""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def _parse_sse_events(raw: str) -> list[dict[str, object]]:
    """把 SSE 文本流切成 [{event, id, data: dict}, ...]。"""
    events: list[dict[str, object]] = []
    current: dict[str, str] = {}
    for line in raw.splitlines():
        if line == "":
            if current:
                data_raw = current.pop("data", "{}") or "{}"
                events.append(
                    {
                        "event": current.pop("event", ""),
                        "id": current.pop("id", ""),
                        "data": json.loads(data_raw),
                    }
                )
                current = {}
            continue
        if line.startswith(":"):
            continue
        if ":" not in line:
            continue
        field, _, value = line.partition(":")
        current[field] = value.lstrip(" ")
    if current:
        data_raw = current.pop("data", "{}") or "{}"
        events.append(
            {
                "event": current.pop("event", ""),
                "id": current.pop("id", ""),
                "data": json.loads(data_raw),
            }
        )
    return events


def test_chat_weather() -> None:
    """POST /api/chat 调用 weather_agent 回答旧金山天气,reply 含城市名。"""
    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "messages": [
                {"role": "user", "content": "What's the weather in San Francisco?"}
            ]
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "reply" in body
    assert "San Francisco" in body["reply"]


def test_chat_empty_messages_returns_400() -> None:
    """空 messages 列表应返回 400 而非 422。"""
    client = TestClient(app)
    response = client.post("/api/chat", json={"messages": []})
    assert response.status_code == 400
    assert response.json()["detail"] == "messages must not be empty"


def test_cors_allows_any_origin() -> None:
    """开发期 CORS 应对任意 Origin 放行。"""
    client = TestClient(app)
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers.get("access-control-allow-origin") == "*"


def test_stream_returns_event_stream_headers() -> None:
    """POST /api/chat/stream 响应头应为 SSE。"""
    client = TestClient(app)
    with client.stream(
        "POST",
        "/api/chat/stream",
        json={"messages": [{"role": "user", "content": "hi"}]},
    ) as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["cache-control"] == "no-store"


def test_stream_empty_messages_returns_400() -> None:
    """空 messages 列表应返回 400 而非 422。"""
    client = TestClient(app)
    response = client.post("/api/chat/stream", json={"messages": []})
    assert response.status_code == 400
    assert response.json()["detail"] == "messages must not be empty"


def test_stream_weather_emits_step_and_done() -> None:
    """完整流应至少含 1 条 step 事件 + 末尾 done，且能拼出城市名。"""
    client = TestClient(app)
    with client.stream(
        "POST",
        "/api/chat/stream",
        json={
            "messages": [
                {"role": "user", "content": "What's the weather in San Francisco?"}
            ]
        },
    ) as response:
        assert response.status_code == 200
        lines = list(response.iter_lines())

    raw = "\n".join(lines)
    events = _parse_sse_events(raw)

    steps = [e for e in events if e["event"] == "step"]
    assert len(steps) >= 1
    first_data = cast(dict[str, object], steps[0]["data"])
    first_blocks = cast(list[dict[str, object]], first_data["blocks"])
    assert any(b["type"] in {"tool_call", "text"} for b in first_blocks)

    assert events[-1]["event"] == "done"

    flat: list[object] = [
        b
        for s in steps
        for b in cast(
            list[dict[str, object]], cast(dict[str, object], s["data"])["blocks"]
        )
    ]
    assert "San Francisco" in json.dumps(flat, ensure_ascii=False)
