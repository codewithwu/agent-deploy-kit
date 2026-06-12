"""Backend 端到端烟测。"""

from fastapi.testclient import TestClient

from backend.main import app


def test_health() -> None:
    """GET /health 返回 200 与 {"status": "ok"}。"""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
