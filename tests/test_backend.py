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
