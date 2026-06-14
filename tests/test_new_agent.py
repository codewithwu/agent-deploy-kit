"""scripts/new_agent.py 单元测试。"""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path("scripts/new_agent.py")


@pytest.fixture
def new_agent():
    """以 importlib 加载 scripts/new_agent.py, 避免变成包。"""
    spec = importlib.util.spec_from_file_location("new_agent", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["new_agent"] = module
    spec.loader.exec_module(module)
    return module


def test_render_init_py_contains_name(new_agent) -> None:
    """render_init_py('foo_agent') 输出含 'foo_agent' 与 __all__。"""
    out = new_agent.render_init_py("foo_agent")
    assert "from agents.foo_agent.agent import foo_agent" in out
    assert '__all__ = ["foo_agent"]' in out


def test_render_agent_py_contains_name(new_agent) -> None:
    """render_agent_py 输出含 create_agent 调用且不含 weather_agent 字面量。"""
    out = new_agent.render_agent_py("foo_agent")
    assert "from agents.foo_agent.tools import placeholder_tool" in out
    assert "foo_agent = create_agent(" in out
    assert "tools=[placeholder_tool]" in out
    assert "weather_agent" not in out


def test_render_tools_py_contains_name(new_agent) -> None:
    """render_tools_py 输出含 PlaceholderInput + placeholder_tool。"""
    out = new_agent.render_tools_py("foo_agent")
    assert "class PlaceholderInput" in out
    assert "def placeholder_tool" in out
    assert "@tool(args_schema=PlaceholderInput)" in out
    assert "weather_agent" not in out
