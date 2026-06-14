"""一键生成新智能体子包 + 顶层接入 + 加载测试。"""

import re
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
    "ensure_unique",
    "append_to_top_init",
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
    if not re.match(NAME_PATTERN, name):
        raise SystemExit(
            f"name 必须形如 <prefix>_agent, 小写起头, snake_case, 实际: {name!r}"
        )


def ensure_unique(name: str, agents_dir: Path, top_init: Path) -> None:
    """校验 agents/<name>/ 与顶层 __init__.py 均未注册 name。"""
    target = agents_dir / name
    if target.exists():
        raise SystemExit(f"{target} 已存在，请删除后重试或改名")
    if top_init.exists():
        text = top_init.read_text(encoding="utf-8")
        pattern = (
            r"(?:from\s+agents\s+import\s+[^#\n]*\b" + re.escape(name) + r"\b"
            r"|__all__\s*=\s*\[[^\]]*\b" + re.escape(name) + r"\b[^\]]*\])"
        )
        if re.search(pattern, text):
            raise SystemExit(f"{name!r} 已在 {top_init} 注册")


def append_to_top_init(name: str, top_init: Path) -> None:
    """把 name 按字母序插入顶层 agents/__init__.py 的 __all__ 与 import 行。"""
    text = top_init.read_text(encoding="utf-8")

    # 1. 找/建 from agents import 行
    import_pattern = re.compile(r"^(from\s+agents\s+import\s+)([^\n#]*)$", re.MULTILINE)
    match = import_pattern.search(text)
    if match:
        existing = [n.strip() for n in match.group(2).split(",") if n.strip()]
        if name not in existing:
            existing.append(name)
            existing.sort()
            new_line = f"{match.group(1)}{', '.join(existing)}"
            text = text[: match.start()] + new_line + text[match.end() :]
    else:
        # 无 from 行, 在 __all__ 前插入
        all_match = re.search(r"^__all__\s*=\s*\[[^\]]*\]", text, re.MULTILINE)
        insertion = f"from agents import {name}\n"
        if all_match:
            text = (
                text[: all_match.start()] + insertion + "\n" + text[all_match.start() :]
            )
        else:
            text = insertion + "\n" + text

    # 2. 更新 __all__
    all_pattern = re.compile(r"^(__all__\s*=\s*)\[([^\]]*)\]", re.MULTILINE)
    all_match = all_pattern.search(text)
    if all_match:
        items = [
            n.strip().strip("'\"")
            for n in all_match.group(2).split(",")
            if n.strip().strip("'\"")
        ]
        if name not in items:
            items.append(name)
            items.sort()
            new_all = f'{all_match.group(1)}["{", ".join(items)}"]'
            text = text[: all_match.start()] + new_all + text[all_match.end() :]
    else:
        # 无 __all__ 行, 在文件末尾追加
        text = text.rstrip() + f'\n__all__ = ["{name}"]\n'

    # 3. 校验 + 写回
    try:
        compile(text, str(top_init), "exec")
    except SyntaxError as exc:
        raise SystemExit(f"{top_init} 修改后无法编译, 请手动检查: {exc}") from exc
    top_init.write_text(text, encoding="utf-8")
