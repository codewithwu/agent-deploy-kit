# 智能体脚手架脚本 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加 `scripts/new_agent.py` CLI，一键生成完整可加载的智能体子包（子包三层 + 顶层 `agents/__init__.py` 接入 + 加载测试），零新增依赖。

**Architecture:** 单文件 `scripts/new_agent.py` 用 stdlib `argparse` + `pathlib` + `re`；纯函数渲染模板 + 命令式 IO；测试通过 `importlib.util` 加载脚本与 `tmp_path` 隔离文件系统。

**Tech Stack:** Python 3.13 stdlib、pytest、`uv run`。

---

## 文件结构

**新增**：
- `scripts/new_agent.py` — CLI 入口与所有渲染/校验函数
- `tests/test_new_agent.py` — 脚手架脚本的单元测试（与 `tests/test_agent_loader.py` 同级）

**修改**：
- `agents/CLAUDE.md` — 在"新增一个智能体"段尾追加一行指向脚本

**运行期由 `scripts/new_agent.py` 生成**（不预先创建）：
- `agents/<name>/__init__.py`
- `agents/<name>/agent.py`
- `agents/<name>/tools.py`
- `tests/agents/__init__.py`
- `tests/agents/test_<name>.py`
- `agents/__init__.py`（修改追加 `<name>`）

---

## 任务 1：模块骨架与 `render_init_py`

**Files:**
- Create: `scripts/new_agent.py`
- Create: `tests/test_new_agent.py`

- [ ] **Step 1: 写失败测试 — `render_init_py` 包含 `<name>`**

在 `tests/test_new_agent.py` 顶部添加脚本加载 fixture 与第一个测试：

```python
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
```

- [ ] **Step 2: 运行测试, 期望失败**

Run: `uv run pytest tests/test_new_agent.py -v`
Expected: `ModuleNotFoundError: No module named 'new_agent'` 或 fixture 失败。

- [ ] **Step 3: 创建 `scripts/new_agent.py` 骨架 + `render_init_py`**

```python
"""一键生成新智能体子包 + 顶层接入 + 加载测试。"""

from pathlib import Path

__all__: list[str] = [
    "NAME_PATTERN",
    "AGENTS_PKG",
    "AGENTS_INIT",
    "TESTS_AGENTS_DIR",
    "render_init_py",
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
```

- [ ] **Step 4: 运行测试, 期望通过**

Run: `uv run pytest tests/test_new_agent.py -v`
Expected: 1 passed.

- [ ] **Step 5: 提交**

```bash
git add scripts/new_agent.py tests/test_new_agent.py
git commit -m "feat(scripts): add new_agent.py scaffold with render_init_py"
```

---

## 任务 2: `render_agent_py`

**Files:**
- Modify: `tests/test_new_agent.py`
- Modify: `scripts/new_agent.py`

- [ ] **Step 1: 写失败测试**

在 `tests/test_new_agent.py` 追加:

```python
def test_render_agent_py_contains_name(new_agent) -> None:
    """render_agent_py 输出含 create_agent 调用且不含 weather_agent 字面量。"""
    out = new_agent.render_agent_py("foo_agent")
    assert "from agents.foo_agent.tools import placeholder_tool" in out
    assert "foo_agent = create_agent(" in out
    assert "tools=[placeholder_tool]" in out
    assert "weather_agent" not in out
```

- [ ] **Step 2: 运行, 期望失败**

Run: `uv run pytest tests/test_new_agent.py::test_render_agent_py_contains_name -v`
Expected: AttributeError 或断言失败。

- [ ] **Step 3: 实现 `render_agent_py`**

在 `scripts/new_agent.py` 的 `__all__` 列表追加 `"render_agent_py"`, 在 `render_init_py` 之后追加:

```python
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
```

- [ ] **Step 4: 运行, 期望通过**

Run: `uv run pytest tests/test_new_agent.py -v`
Expected: 2 passed.

- [ ] **Step 5: 提交**

```bash
git add scripts/new_agent.py tests/test_new_agent.py
git commit -m "feat(scripts): add render_agent_py template"
```

---

## 任务 3: `render_tools_py`

**Files:**
- Modify: `tests/test_new_agent.py`
- Modify: `scripts/new_agent.py`

- [ ] **Step 1: 写失败测试**

```python
def test_render_tools_py_contains_name(new_agent) -> None:
    """render_tools_py 输出含 PlaceholderInput + placeholder_tool。"""
    out = new_agent.render_tools_py("foo_agent")
    assert "class PlaceholderInput" in out
    assert "def placeholder_tool" in out
    assert "@tool(args_schema=PlaceholderInput)" in out
    assert "weather_agent" not in out
```

- [ ] **Step 2: 运行, 期望失败**

Run: `uv run pytest tests/test_new_agent.py::test_render_tools_py_contains_name -v`
Expected: AttributeError.

- [ ] **Step 3: 实现 `render_tools_py`**

`__all__` 追加 `"render_tools_py"`, 实现:

```python
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
```

- [ ] **Step 4: 运行, 期望通过**

Run: `uv run pytest tests/test_new_agent.py -v`
Expected: 3 passed.

- [ ] **Step 5: 提交**

```bash
git add scripts/new_agent.py tests/test_new_agent.py
git commit -m "feat(scripts): add render_tools_py template"
```

---

## 任务 4: `render_test_py`

**Files:**
- Modify: `tests/test_new_agent.py`
- Modify: `scripts/new_agent.py`

- [ ] **Step 1: 写失败测试**

```python
def test_render_test_py_contains_name(new_agent) -> None:
    """render_test_py 输出含与 test_agent_loader 一致的 fixture 与断言。"""
    out = new_agent.render_test_py("foo_agent")
    assert 'monkeypatch.setenv("AGENT_NAME", "foo_agent")' in out
    assert "from agents.foo_agent import foo_agent" in out
    assert "get_agent() is foo_agent" in out
    assert "weather_agent" not in out
```

- [ ] **Step 2: 运行, 期望失败**

Run: `uv run pytest tests/test_new_agent.py::test_render_test_py_contains_name -v`
Expected: AttributeError.

- [ ] **Step 3: 实现 `render_test_py`**

`__all__` 追加 `"render_test_py"`, 实现:

```python
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
```

- [ ] **Step 4: 运行, 期望通过**

Run: `uv run pytest tests/test_new_agent.py -v`
Expected: 4 passed.

- [ ] **Step 5: 提交**

```bash
git add scripts/new_agent.py tests/test_new_agent.py
git commit -m "feat(scripts): add render_test_py template"
```

---

## 任务 5: `validate_name`

**Files:**
- Modify: `tests/test_new_agent.py`
- Modify: `scripts/new_agent.py`

- [ ] **Step 1: 写失败测试**

```python
def test_validate_name_accepts_weather_agent(new_agent) -> None:
    """validate_name 不对合法 name 抛错。"""
    new_agent.validate_name("weather_agent")  # 不抛


def test_validate_name_rejects_no_suffix(new_agent) -> None:
    """缺 _agent 后缀 → SystemExit。"""
    with pytest.raises(SystemExit):
        new_agent.validate_name("weather")


def test_validate_name_rejects_uppercase(new_agent) -> None:
    """大写 → SystemExit。"""
    with pytest.raises(SystemExit):
        new_agent.validate_name("Weather_agent")


def test_validate_name_rejects_empty(new_agent) -> None:
    """空串 → SystemExit。"""
    with pytest.raises(SystemExit):
        new_agent.validate_name("")
```

- [ ] **Step 2: 运行, 期望失败**

Run: `uv run pytest tests/test_new_agent.py -k validate_name -v`
Expected: AttributeError (`validate_name` 不存在).

- [ ] **Step 3: 实现 `validate_name`**

`__all__` 追加 `"validate_name"`, 并在文件顶部 `from __future__ import annotations` 之后追加 `import re`, 然后:

```python
def validate_name(name: str) -> None:
    """校验 name 符合 <prefix>_agent 约定; 失败 SystemExit(1)。"""
    if not __import__("re").match(NAME_PATTERN, name):
        raise SystemExit(
            f"name 必须形如 <prefix>_agent, 小写起头, snake_case, 实际: {name!r}"
        )
```

- [ ] **Step 4: 运行, 期望通过**

Run: `uv run pytest tests/test_new_agent.py -k validate_name -v`
Expected: 4 passed.

- [ ] **Step 5: 提交**

```bash
git add scripts/new_agent.py tests/test_new_agent.py
git commit -m "feat(scripts): add validate_name with 4 spec branches"
```

---

## 任务 6: `ensure_unique`

**Files:**
- Modify: `tests/test_new_agent.py`
- Modify: `scripts/new_agent.py`

- [ ] **Step 1: 写失败测试**

```python
def test_ensure_unique_rejects_existing_dir(
    new_agent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """agents/<name>/ 已存在 → SystemExit。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "foo_agent").mkdir()
    top_init = tmp_path / "agents" / "__init__.py"
    with pytest.raises(SystemExit):
        new_agent.ensure_unique("foo_agent", agents_dir, top_init)


def test_ensure_unique_rejects_already_registered(
    new_agent, tmp_path: Path
) -> None:
    """__init__.py 已注册 name → SystemExit。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    top_init = agents_dir / "__init__.py"
    top_init.write_text(
        "from agents import foo_agent\n"
        '__all__ = ["foo_agent"]\n',
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        new_agent.ensure_unique("foo_agent", agents_dir, top_init)


def test_ensure_unique_passes_when_clean(
    new_agent, tmp_path: Path
) -> None:
    """无冲突 → 不抛。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    top_init = agents_dir / "__init__.py"
    top_init.write_text('__all__ = []\n', encoding="utf-8")
    new_agent.ensure_unique("foo_agent", agents_dir, top_init)  # 不抛
```

- [ ] **Step 2: 运行, 期望失败**

Run: `uv run pytest tests/test_new_agent.py -k ensure_unique -v`
Expected: AttributeError.

- [ ] **Step 3: 实现 `ensure_unique`**

`__all__` 追加 `"ensure_unique"`, `import re` 改为 `import re` 已存在, 实现:

```python
def ensure_unique(name: str, agents_dir: Path, top_init: Path) -> None:
    """校验 agents/<name>/ 与顶层 __init__.py 均未注册 name。"""
    target = agents_dir / name
    if target.exists():
        raise SystemExit(f"{target} 已存在, 请删除后重试或改名")
    if top_init.exists():
        text = top_init.read_text(encoding="utf-8")
        pattern = (
            r"(?:from\s+agents\s+import\s+[^#\n]*\b" + re.escape(name) + r"\b"
            r"|__all__\s*=\s*\[[^\]]*\b" + re.escape(name) + r"\b[^\]]*\])"
        )
        if re.search(pattern, text):
            raise SystemExit(f"{name!r} 已在 {top_init} 注册")
```

- [ ] **Step 4: 运行, 期望通过**

Run: `uv run pytest tests/test_new_agent.py -k ensure_unique -v`
Expected: 3 passed.

- [ ] **Step 5: 提交**

```bash
git add scripts/new_agent.py tests/test_new_agent.py
git commit -m "feat(scripts): add ensure_unique with dir and registration checks"
```

---

## 任务 7: `append_to_top_init`

**Files:**
- Modify: `tests/test_new_agent.py`
- Modify: `scripts/new_agent.py`

- [ ] **Step 1: 写失败测试**

```python
def test_append_to_top_init_inserts_alphabetically(
    new_agent, tmp_path: Path
) -> None:
    """按字母序把 name 插入 __all__ 与 from 行。"""
    top_init = tmp_path / "__init__.py"
    top_init.write_text(
        "from agents import zeta_agent\n"
        '__all__ = ["zeta_agent"]\n',
        encoding="utf-8",
    )
    new_agent.append_to_top_init("alpha_agent", top_init)
    text = top_init.read_text(encoding="utf-8")
    assert "alpha_agent" in text
    assert "zeta_agent" in text
    # 字母序: alpha < zeta
    assert text.index("alpha_agent") < text.index("zeta_agent")


def test_append_to_top_init_preserves_valid_python(
    new_agent, tmp_path: Path
) -> None:
    """修改后文本仍是合法 Python。"""
    top_init = tmp_path / "__init__.py"
    top_init.write_text('__all__ = []\n', encoding="utf-8")
    new_agent.append_to_top_init("foo_agent", top_init)
    text = top_init.read_text(encoding="utf-8")
    compile(text, str(top_init), "exec")  # 不抛


def test_append_to_top_init_handles_existing_imports(
    new_agent, tmp_path: Path
) -> None:
    """已有 from 行 → 追加在同行; 不会创建重复 import。"""
    top_init = tmp_path / "__init__.py"
    top_init.write_text(
        "from agents import beta_agent\n"
        '__all__ = ["beta_agent"]\n',
        encoding="utf-8",
    )
    new_agent.append_to_top_init("alpha_agent", top_init)
    text = top_init.read_text(encoding="utf-8")
    assert text.count("from agents import") == 1
    assert "beta_agent, alpha_agent" in text or "alpha_agent, beta_agent" in text
```

- [ ] **Step 2: 运行, 期望失败**

Run: `uv run pytest tests/test_new_agent.py -k append_to_top_init -v`
Expected: AttributeError.

- [ ] **Step 3: 实现 `append_to_top_init`**

`__all__` 追加 `"append_to_top_init"`, 实现:

```python
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
            text = text[: match.start()] + new_line + text[match.end():]
    else:
        # 无 from 行, 在 __all__ 前插入
        all_match = re.search(r"^__all__\s*=\s*\[[^\]]*\]", text, re.MULTILINE)
        insertion = f"from agents import {name}\n"
        if all_match:
            text = text[: all_match.start()] + insertion + "\n" + text[all_match.start():]
        else:
            text = insertion + "\n" + text

    # 2. 更新 __all__
    all_pattern = re.compile(r"^(__all__\s*=\s*)\[([^\]]*)\]", re.MULTILINE)
    all_match = all_pattern.search(text)
    if all_match:
        items = [n.strip().strip("'\"") for n in all_match.group(2).split(",") if n.strip().strip("'\"")]
        if name not in items:
            items.append(name)
            items.sort()
            new_all = f'{all_match.group(1)}["{", ".join(items)}"]'
            text = text[: all_match.start()] + new_all + text[all_match.end():]
    else:
        # 无 __all__ 行, 在文件末尾追加
        text = text.rstrip() + f'\n__all__ = ["{name}"]\n'

    # 3. 校验 + 写回
    try:
        compile(text, str(top_init), "exec")
    except SyntaxError as exc:
        raise SystemExit(f"{top_init} 修改后无法编译, 请手动检查: {exc}") from exc
    top_init.write_text(text, encoding="utf-8")
```

- [ ] **Step 4: 运行, 期望通过**

Run: `uv run pytest tests/test_new_agent.py -k append_to_top_init -v`
Expected: 3 passed.

- [ ] **Step 5: 提交**

```bash
git add scripts/new_agent.py tests/test_new_agent.py
git commit -m "feat(scripts): add append_to_top_init with alphabetized insertion"
```

---

## 任务 8: `main()` CLI 入口

**Files:**
- Modify: `tests/test_new_agent.py`
- Modify: `scripts/new_agent.py`

- [ ] **Step 1: 写失败测试 — 端到端在 tmp_path 中跑 main()**

```python
def test_main_writes_files_and_updates_top_init(
    new_agent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    """main() 创建子包 + 顶层 __init__ 接入 + tests/agents/__init__.py。"""
    # 复刻仓库根结构
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "__init__.py").write_text('__all__ = []\n', encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "agents").mkdir()

    monkeypatch.chdir(tmp_path)
    rc = new_agent.main(["foo_agent"])
    assert rc == 0

    # 子包三文件
    assert (agents_dir / "foo_agent" / "__init__.py").exists()
    assert (agents_dir / "foo_agent" / "agent.py").exists()
    assert (agents_dir / "foo_agent" / "tools.py").exists()
    # 测试样板
    assert (tmp_path / "tests" / "agents" / "__init__.py").exists()
    assert (tmp_path / "tests" / "agents" / "test_foo_agent.py").exists()
    # 顶层 __init__.py 被更新
    top_text = (agents_dir / "__init__.py").read_text(encoding="utf-8")
    assert "foo_agent" in top_text
    compile(top_text, str(agents_dir / "__init__.py"), "exec")


def test_main_rejects_duplicate_run(
    new_agent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """main() 第二次运行同名 → SystemExit, 不覆盖既有文件。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "__init__.py").write_text('__all__ = []\n', encoding="utf-8")
    (tmp_path / "tests" / "agents").mkdir(parents=True)
    (agents_dir / "foo_agent").mkdir()

    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit):
        new_agent.main(["foo_agent"])


def test_main_uses_module_constants(
    new_agent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """不传 argv 时, main() 从 sys.argv[1:] 读取。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "__init__.py").write_text('__all__ = []\n', encoding="utf-8")
    (tmp_path / "tests" / "agents").mkdir(parents=True)

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("sys.argv", ["new_agent.py", "foo_agent"])
    rc = new_agent.main()
    assert rc == 0
    assert (agents_dir / "foo_agent" / "agent.py").exists()
```

- [ ] **Step 2: 运行, 期望失败**

Run: `uv run pytest tests/test_new_agent.py -k "test_main" -v`
Expected: AttributeError.

- [ ] **Step 3: 实现 `main()` 与 `__main__` 块**

`__all__` 追加 `"main"`, `import argparse` 加到文件顶部, 实现:

```python
import argparse


def main(argv: list[str] | None = None) -> int:
    """CLI 入口: 生成 agents/<name>/ 子包 + 顶层接入 + 加载测试。"""
    parser = argparse.ArgumentParser(
        prog="new_agent",
        description="一键生成新智能体子包 (子包 + 顶层接入 + 加载测试)。",
    )
    parser.add_argument(
        "name",
        help="智能体名, 形如 weather_agent (小写起头, snake_case, _agent 后缀)",
    )
    args = parser.parse_args(argv)
    name: str = args.name

    validate_name(name)
    ensure_unique(name, AGENTS_PKG, AGENTS_INIT)

    pkg_dir = AGENTS_PKG / name
    pkg_dir.mkdir(parents=True)
    (pkg_dir / "__init__.py").write_text(render_init_py(name), encoding="utf-8")
    (pkg_dir / "agent.py").write_text(render_agent_py(name), encoding="utf-8")
    (pkg_dir / "tools.py").write_text(render_tools_py(name), encoding="utf-8")

    TESTS_AGENTS_DIR.mkdir(parents=True, exist_ok=True)
    (TESTS_AGENTS_DIR / "__init__.py").write_text("", encoding="utf-8")
    (TESTS_AGENTS_DIR / f"test_{name}.py").write_text(
        render_test_py(name), encoding="utf-8"
    )

    append_to_top_init(name, AGENTS_INIT)

    print(f"已生成: {pkg_dir / '__init__.py'}")
    print(f"已生成: {pkg_dir / 'agent.py'}")
    print(f"已生成: {pkg_dir / 'tools.py'}")
    print(f"已生成: {TESTS_AGENTS_DIR / f'test_{name}.py'}")
    print(f"已更新: {AGENTS_INIT}")
    print(f"设置 AGENT_NAME={name} 后启动后端即可。")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
```

- [ ] **Step 4: 运行, 期望通过**

Run: `uv run pytest tests/test_new_agent.py -v`
Expected: 所有用例通过 (此前 11 + 此处 3 = 14 passed).

- [ ] **Step 5: 运行质量检查**

```bash
uv run ruff format scripts/new_agent.py tests/test_new_agent.py
uv run ruff check --fix scripts/new_agent.py tests/test_new_agent.py
uv run mypy scripts/new_agent.py
```

Expected: 全部无错。若 ruff/mypy 报告格式或类型问题, 按提示修复后重跑。

- [ ] **Step 6: 提交**

```bash
git add scripts/new_agent.py tests/test_new_agent.py
git commit -m "feat(scripts): add main() CLI with argparse and __main__ block"
```

---

## 任务 9: `agents/CLAUDE.md` 加一行脚手架指引

**Files:**
- Modify: `agents/CLAUDE.md`

- [ ] **Step 1: 在"新增一个智能体"段尾追加**

打开 `agents/CLAUDE.md`, 找到第 43 行 (现有 6 步流程最后一行是 "改完后跑 `uv run ruff check agents/`、..."), 在该行之后追加一段:

```markdown
## 一键脚手架

执行 `uv run python scripts/new_agent.py <name>` 可自动完成上述 1–5 步, 生成子包三层文件 + 顶层 `agents/__init__.py` 接入 + 加载测试。生成物含一个 `placeholder_tool` 占位, 替换或删除后再正式使用。
```

- [ ] **Step 2: 检查无格式破坏**

Run: `cat agents/CLAUDE.md | tail -20`
Expected: 末尾段落紧接 6 步流程, 标题层级一致 (`##`).

- [ ] **Step 3: 提交**

```bash
git add agents/CLAUDE.md
git commit -m "docs(agents): point readers to new_agent.py scaffold"
```

---

## 任务 10: 端到端烟测

**Files:** 无 (手动验证)

- [ ] **Step 1: 跑完整测试套件**

Run: `uv run pytest`
Expected: 全部通过 (现有 `test_agent_loader.py` 4 + `test_backend.py` + 新的 `test_new_agent.py` 14).

- [ ] **Step 2: 跑质量检查**

```bash
uv run ruff format .
uv run ruff check --fix .
uv run mypy .
```

Expected: 无错。

- [ ] **Step 3: 端到端: 生成一个测试智能体**

Run: `uv run python scripts/new_agent.py foo_agent`
Expected: 6 行 stdout 列出 5 个文件路径 + 1 行提示; exit code 0.

- [ ] **Step 4: 验证生成物**

```bash
ls agents/foo_agent/ tests/agents/
cat agents/__init__.py
```

Expected: `agents/foo_agent/` 含 `__init__.py` `agent.py` `tools.py`; `tests/agents/` 含 `__init__.py` `test_foo_agent.py`; `agents/__init__.py` 含 `from agents import foo_agent` 与 `__all__` 中 `"foo_agent"`。

- [ ] **Step 5: 跑新生成的加载测试**

Run: `AGENT_NAME=foo_agent uv run pytest tests/agents/test_foo_agent.py -v`
Expected: 1 passed.

- [ ] **Step 6: 端到端启动后端并打一次 chat**

```bash
AGENT_NAME=foo_agent uv run uvicorn backend.main:app --port 8765 &
sleep 2
curl -s -X POST http://127.0.0.1:8765/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
kill %1
```

Expected: HTTP 200 且响应 JSON `reply` 含 `placeholder: hello`.

- [ ] **Step 7: 清理测试智能体**

```bash
rm -rf agents/foo_agent tests/agents/test_foo_agent.py
git checkout -- agents/__init__.py
```

注意: `tests/agents/__init__.py` 保留 (其它生成的测试还会用)。验证 `agents/__init__.py` 回到任务 9 之前的状态:

Run: `cat agents/__init__.py`
Expected: 只含 `from agents import weather_agent` 与 `__all__ = ["weather_agent"]`.

- [ ] **Step 8: 提交 (如清理过程无变更则跳过)**

如果清理后 `git status` 为干净, 跳过提交; 否则:

```bash
git add -A
git commit -m "chore: post-scaffold smoke-test cleanup (no net change)"
```

---

## 自审记录

**Spec 覆盖检查**:
- 模块结构 (NAME_PATTERN/AGENTS_PKG/AGENTS_INIT/TESTS_AGENTS_DIR) → 任务 1
- 4 个 render 函数 → 任务 1–4
- validate_name 4 个分支 → 任务 5
- ensure_unique 2 个分支 + 1 个不抛 → 任务 6
- append_to_top_init 字母序插入 + compile 校验 + from 行复用 → 任务 7
- main() argparse + 6 步执行流 + stdout 打印 → 任务 8
- agents/CLAUDE.md 一行指引 → 任务 9
- 端到端烟测 (生成 + 加载测试 + 后端 chat) → 任务 10

**类型一致性**:
- `validate_name(name: str) -> None` 在任务 5 定义, 任务 8 调用 ✓
- `ensure_unique(name: str, agents_dir: Path, top_init: Path) -> None` 在任务 6 定义, 任务 8 调用 ✓
- `append_to_top_init(name: str, top_init: Path) -> None` 在任务 7 定义, 任务 8 调用 ✓
- `render_*` 在任务 1–4 定义, 任务 8 调用 ✓
- `main(argv: list[str] | None = None) -> int` 在任务 8 定义, `__main__` 块调用 ✓

**占位符检查**: 全文无 TBD / TODO / "适当" / "类似 Task N" / 未定义符号引用。
