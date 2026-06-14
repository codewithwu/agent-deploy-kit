"""一键生成新智能体子包 + 顶层接入 + 加载测试。"""

from pathlib import Path

__all__: list[str] = [
    "NAME_PATTERN",
    "AGENTS_PKG",
    "AGENTS_INIT",
    "TESTS_AGENTS_DIR",
    "render_init_py",
    "render_agent_py",
    "render_tools_py",
    "render_test_py",
    "validate_name",
]

NAME_PATTERN = r"^[a-z][a-z0-9_]*_agent$"
AGENTS_PKG = Path("agents")
AGENTS_INIT = AGENTS_PKG / "__init__.py"
TESTS_AGENTS_DIR = Path("tests/agents")


def render_init_py(name: str) -> str:
    """渲染 agents/<name>/__init__.py 内容。"""
    return (
        f'"""{name} 智能体。"""\n'
        "\n"
        f"from agents.{name}.agent import {name}\n"
        "\n"
        f'__all__ = ["{name}"]\n'
    )


def render_agent_py(name: str) -> str:
    """渲染 agents/<name>/agent.py 内容。"""
    return (
        f'"""{name} 智能体。"""\n'
        "\n"
        "from langchain.agents import create_agent\n"
        "\n"
        f"from agents.{name}.tools import placeholder_tool\n"
        "from utils.langchain_model import get_singleton_client\n"
        "\n"
        f"{name} = create_agent(\n"
        '    model=get_singleton_client(llm_provider="longcat"),\n'
        "    tools=[placeholder_tool],\n"
        '    system_prompt="You are a helpful assistant",\n'
        ")\n"
    )


def render_tools_py(name: str) -> str:
    """渲染 agents/<name>/tools.py 内容。"""
    return (
        f'"""{name} 智能体可用工具集合。"""\n'
        "\n"
        "from langchain_core.tools import tool\n"
        "from pydantic import BaseModel, Field\n"
        "\n"
        "\n"
        "class PlaceholderInput(BaseModel):\n"
        '    """占位工具输入。"""\n'
        "\n"
        '    query: str = Field(description="查询内容")\n'
        "\n"
        "\n"
        "@tool(args_schema=PlaceholderInput)\n"
        "def placeholder_tool(query: str) -> str:\n"
        '    """占位工具:回显输入. 脚手架生成, 请替换为真实工具或删除.\n'
        "\n"
        "    Args:\n"
        "        query: 查询字符串\n"
        "\n"
        "    Returns:\n"
        "        回显结果\n"
        '    """\n'
        '    return f"placeholder: {query}"\n'
    )


def render_test_py(name: str) -> str:
    """渲染 tests/agents/test_<name>.py 内容。"""
    return (
        f'"""{name} 加载测试。"""\n'
        "\n"
        "import pytest\n"
        "\n"
        "\n"
        "@pytest.fixture(autouse=True)\n"
        "def _reset_agent_cache() -> None:\n"
        '    """lru_cache 是模块级, 跨测试泄漏; 每个用例前后清空。"""\n'
        "    from backend.agent_loader import get_agent\n"
        "\n"
        "    get_agent.cache_clear()\n"
        "    yield\n"
        "    get_agent.cache_clear()\n"
        "\n"
        "\n"
        "def test_loads_agent(monkeypatch: pytest.MonkeyPatch) -> None:\n"
        f'    """AGENT_NAME={name} 时返回 {name} 实例。"""\n'
        f'    monkeypatch.setenv("AGENT_NAME", "{name}")\n'
        "\n"
        f"    from agents.{name} import {name}\n"
        "    from backend.agent_loader import get_agent\n"
        "\n"
        f"    assert get_agent() is {name}\n"
    )


def validate_name(name: str) -> None:
    """校验 name 符合 <prefix>_agent 约定; 失败 SystemExit(1)。"""
    if not __import__("re").match(NAME_PATTERN, name):
        raise SystemExit(
            f"name 必须形如 <prefix>_agent, 小写起头, snake_case, 实际: {name!r}"
        )
