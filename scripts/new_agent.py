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
