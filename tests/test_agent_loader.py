"""agent_loader 单元测试。"""

import pytest


@pytest.fixture(autouse=True)
def _reset_agent_cache():
    """lru_cache 是模块级，跨测试泄漏；每个用例前后清空。"""
    from backend.agent_loader import get_agent

    get_agent.cache_clear()
    yield
    get_agent.cache_clear()


def test_missing_env_raises_runtime_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """未设置 AGENT_NAME 时 get_agent() 应抛 RuntimeError。"""
    monkeypatch.delenv("AGENT_NAME", raising=False)

    from backend.agent_loader import get_agent

    with pytest.raises(RuntimeError, match="AGENT_NAME"):
        get_agent()


def test_loads_weather_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """AGENT_NAME=weather_agent 时返回 weather_agent 实例。"""
    monkeypatch.setenv("AGENT_NAME", "weather_agent")

    from agents.weather_agent import weather_agent
    from backend.agent_loader import get_agent

    assert get_agent() is weather_agent


def test_caches_result(monkeypatch: pytest.MonkeyPatch) -> None:
    """多次调用 get_agent() 应返回同一实例（lru_cache 命中）。"""
    monkeypatch.setenv("AGENT_NAME", "weather_agent")

    from backend.agent_loader import get_agent

    assert get_agent() is get_agent()
