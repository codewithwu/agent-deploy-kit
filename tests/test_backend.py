"""Backend 端到端烟测。"""

from fastapi.testclient import TestClient

from backend.main import app


def test_health() -> None:
    """GET /health 返回 200 与 {"status": "ok"}。"""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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
