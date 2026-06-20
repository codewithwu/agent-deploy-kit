"""code_agent 加载与工具测试。"""

from collections.abc import Generator

import pytest


@pytest.fixture(autouse=True)
def _reset_agent_cache() -> Generator[None, None, None]:
    """lru_cache 是模块级, 跨测试泄漏; 每个用例前后清空。"""
    from backend.agent_loader import get_agent

    get_agent.cache_clear()
    yield
    get_agent.cache_clear()


def test_loads_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """AGENT_NAME=code_agent 时返回 code_agent 实例。"""
    monkeypatch.setenv("AGENT_NAME", "code_agent")

    from agents.code_agent import code_agent
    from backend.agent_loader import get_agent

    assert get_agent() is code_agent
