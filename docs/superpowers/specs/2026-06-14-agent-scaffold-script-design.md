# 新增智能体脚手架脚本 设计

- 日期：2026-06-14
- 范围：新增 `scripts/new_agent.py` 一键脚手架，让用户从零生成一个完整可加载的智能体子包（包含子包三层文件、顶层 `agents/__init__.py` 接入、加载测试）。**不改** `backend/`、`agents/weather_agent/`、`utils/`。

## 背景与目标

`agents/CLAUDE.md` 已写明新增一个智能体的 6 步流程，但流程全部手动：
- 新建子目录与三个文件
- 在 `agents/__init__.py` 添加 `from agents import <name>` 并同步 `__all__`
- 手写 `tests/agents/test_<name>.py`

`weather_agent` 是唯一参照物，对新用户来说仍然要逐字抄写并改 4 处名字。脚手架脚本把这个重复劳动自动化。

目标：
- 一条命令 `uv run python scripts/new_agent.py <name>` 即可生成完整子包 + 顶层接入 + 加载测试。
- 生成物**立即可跑**（设 `AGENT_NAME=<name>` 启动后端即可用）。
- 与 `agent_loader` 解耦：脚本不读环境变量、不导入后端；纯生成器。
- 零新增依赖（仅 stdlib）。
- 改动面最小：不动现有任何智能体、不动 `backend/`、不动 `utils/`。

设计原则：
- 纯函数渲染 + 命令式 IO：渲染逻辑脱离文件系统，单元测试覆盖纯函数，IO 路径用 `tmp_path` 覆盖关键分支。
- 失败前置：name 校验、唯一性、`__all__` 检查都在写文件前完成，**不**写一半留半成品。
- 不做幂等：同名重复生成报错，避免覆盖未提交改动。

## 目录与文件

```
scripts/
└── new_agent.py                            # 新增（CLI 入口 + 渲染函数）

agents/
├── __init__.py                             # 修改：追加 <name> 导入与 __all__ 项
└── <name>/                                 # 新增（由脚本生成）
    ├── __init__.py
    ├── agent.py
    └── tools.py

tests/
└── agents/                                 # 新增目录
    ├── __init__.py                         # 空文件，使 pytest 收集为包
    └── test_<name>.py

agents/CLAUDE.md                            # 修改：在"新增一个智能体"段尾追加一句指向脚本
```

不动：`agents/weather_agent/`、`backend/`、`utils/`、`tests/conftest.py`、根 `CLAUDE.md`。

## 组件

### `scripts/new_agent.py`（新增）

```python
"""一键生成新智能体子包 + 顶层接入 + 加载测试。"""

import argparse
import re
import sys
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
    "main",
]

NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]*_agent$")
AGENTS_PKG = Path("agents")
AGENTS_INIT = AGENTS_PKG / "__init__.py"
TESTS_AGENTS_DIR = Path("tests/agents")


def render_init_py(name: str) -> str: ...
def render_agent_py(name: str) -> str: ...
def render_tools_py(name: str) -> str: ...
def render_test_py(name: str) -> str: ...

def validate_name(name: str) -> None: ...
def ensure_unique(name: str) -> None: ...
def append_to_top_init(name: str) -> None: ...

def main(argv: list[str] | None = None) -> int: ...

if __name__ == "__main__":
    sys.exit(main())
```

要点：
- **纯 stdlib**：`argparse` + `re` + `pathlib`，无第三方依赖。
- **渲染纯函数**返回 `str`，不触 IO，单元测试断言内容。
- **`__all__` 显式声明**，与 `agents/CLAUDE.md` 第 22 行规约一致。
- **类型注解 100%**：`main(argv: list[str] | None = None) -> int`，`Path` 全部参数化。
- **中文 docstring** 顶部一行。
- 渲染内容用 `str.format` 注入 `<name>`，避免 f-string 在多行模板里把缩进搞乱（参考 `backend/agent_loader.py` 的同等简洁度）。

### 模板内容

**`agents/<name>/__init__.py`**

```python
"""<name> 智能体。"""

from agents.<name>.agent import <name>

__all__ = ["<name>"]
```

**`agents/<name>/agent.py`**

```python
"""<name> 智能体。"""

from langchain.agents import create_agent

from agents.<name>.tools import placeholder_tool
from utils.langchain_model import get_singleton_client

<name> = create_agent(
    model=get_singleton_client(llm_provider="longcat"),
    tools=[placeholder_tool],
    system_prompt="You are a helpful assistant",
)
```

**`agents/<name>/tools.py`**

```python
"""<name> 智能体可用工具集合。"""

from langchain_core.tools import tool
from pydantic import BaseModel, Field


class PlaceholderInput(BaseModel):
    """占位工具输入。"""

    query: str = Field(description="查询内容")


@tool(args_schema=PlaceholderInput)
def placeholder_tool(query: str) -> str:
    """占位工具:回显输入. 脚手架生成, 请替换为真实工具或删除.

    Args:
        query: 查询字符串

    Returns:
        回显结果
    """
    return f"placeholder: {query}"
```

**`tests/agents/test_<name>.py`**（与 `tests/test_agent_loader.py` 风格一致）

```python
"""<name> 加载测试。"""

import pytest


@pytest.fixture(autouse=True)
def _reset_agent_cache() -> None:
    """lru_cache 是模块级, 跨测试泄漏; 每个用例前后清空。"""
    from backend.agent_loader import get_agent

    get_agent.cache_clear()
    yield
    get_agent.cache_clear()


def test_loads_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """AGENT_NAME=<name> 时返回 <name> 实例。"""
    monkeypatch.setenv("AGENT_NAME", "<name>")

    from agents.<name> import <name>
    from backend.agent_loader import get_agent

    assert get_agent() is <name>
```

### `validate_name(name)`

- 必须是 `str` 且匹配 `NAME_PATTERN`。
- 不匹配时 `SystemExit(1)` + stderr 输出 `name 必须形如 <prefix>_agent, 小写起头, snake_case`。
- 空串同样走 `SystemExit`。

### `ensure_unique(name)`

- 若 `AGENTS_PKG / name` 已存在 → `SystemExit(1)` + 提示「<name> 已存在, 请删除后重试或改名」。
- 若 `name` 已在 `AGENTS_INIT` 文本里出现（在 `__all__` 列表项中或 `from agents import` 行中）→ `SystemExit(1)` + 提示「<name> 已在 agents/__init__.py 注册」。

文本匹配策略（避免引入 `ast` 解析失败时崩溃）：
- 用 `re.search(rf'(?:from\s+agents\s+import\s+.*\b{name}\b|__all__\s*=\s*\[[^\]]*\b{name}\b[^\]]*\])', text)` 即可。

### `append_to_top_init(name)`

读取 `AGENTS_INIT`，按字母序把 `<name>` 插入到 `__all__ = [...]` 与对应的 `from agents import ...` 行。两种格式都支持：

```python
# 格式 A（当前 weather_agent 实际形态）
__all__ = ["weather_agent"]
from agents import weather_agent

# 格式 B（亦支持）
from agents import weather_agent
__all__ = ["weather_agent"]
```

策略：
- 用 `re.search(r'__all__\s*=\s*\[([^\]]*)\]', text)` 拿当前 `__all__` 内容。
- 解析为列表、按字母序插入、重新构造 `__all__` 行。
- 在 `from agents import ...` 行追加 `, <name>`（若该行已存在其他名字则追加，否则新增一行）。
- `compile()` 校验修改后的文本为合法 Python，失败则 `SystemExit(1)`。
- 写回原文件。

### `main(argv)` / CLI

- `argparse` 单位置参数 `name`，`help` 写明「形如 weather_agent」。
- 执行顺序：`validate_name` → `ensure_unique` → 写 4 个文件 → `append_to_top_init`。
- 成功时 stdout 打印 4 个文件路径 + 一行「设置 `AGENT_NAME=<name>` 后启动后端即可」。
- 失败一律 `SystemExit(1)` + stderr 简明信息（不用 traceback，符合 CLI 礼仪）。

### `agents/CLAUDE.md` 修改

在"新增一个智能体"段（第 37–43 行）末尾追加一行：

```
也可一键执行 `uv run python scripts/new_agent.py <name>` 脚手架生成, 自动完成上述 1–5 步。
```

## 数据流

```
$ uv run python scripts/new_agent.py foo_agent
   ├─ validate_name("foo_agent")                 # 形状检查
   ├─ ensure_unique("foo_agent")                 # 目录/顶层 __init__ 不重名
   ├─ 写 agents/foo_agent/__init__.py            # render_init_py("foo_agent")
   ├─ 写 agents/foo_agent/agent.py               # render_agent_py("foo_agent")
   ├─ 写 agents/foo_agent/tools.py               # render_tools_py("foo_agent")
   ├─ 写 tests/agents/test_foo_agent.py          # render_test_py("foo_agent")
   ├─ 写 tests/agents/__init__.py                # 空文件
   ├─ append_to_top_init("foo_agent")            # 改 agents/__init__.py
   └─ 打印成功信息

$ AGENT_NAME=foo_agent uv run uvicorn backend.main:app
   └─ get_agent() 走 importlib, 加载到 agents.foo_agent.agent.foo_agent 实例
```

## 错误处理

| 场景 | 触发时机 | 退出码 | 提示 |
|------|----------|--------|------|
| name 形状不合规 | main 入口 | 1 | stderr 给出正则约束 |
| `agents/<name>/` 已存在 | ensure_unique | 1 | stderr 提示「<name> 已存在」 |
| name 已在 `agents/__init__.py` 注册 | ensure_unique | 1 | stderr 提示具体位置 |
| `agents/__init__.py` 含不可解析的 `__all__` | append_to_top_init | 1 | stderr 提示「请手动修改」 |
| 写文件权限不足 | 文件写入 | 1 | 由 `OSError` 透传，stderr 提示路径 |
| `tests/agents/` 已是包（已含 `__init__.py`） | 写 `__init__.py` | — | `write_text` 静默覆盖空文件等价；不报错 |

不引入 `--force` / `--dry-run` 等当前用不到的旗标（YAGNI）。

## 验证标准

1. `uv run ruff format .` 对 `scripts/new_agent.py` 与 `tests/test_new_agent.py` 不留格式警告。
2. `uv run ruff check --fix .` 全过。
3. `uv run mypy .` 全过（`scripts/new_agent.py` 公共函数带类型注解、`__all__` 显式声明）。
4. `uv run pytest` 全部通过，包含：
   - 现有 `tests/test_agent_loader.py`、`tests/test_backend.py`。
   - 新增 `tests/test_new_agent.py`（与 `tests/test_agent_loader.py` 同级）：
     - `test_render_init_py_contains_name` / `test_render_agent_py_contains_name` / `test_render_tools_py_contains_name` / `test_render_test_py_contains_name`：断言生成字符串含 `<name>`，且不含其它已知 name 字面量。
     - `test_validate_name_accepts_weather_agent` / `test_validate_name_rejects_no_suffix` / `test_validate_name_rejects_uppercase` / `test_validate_name_rejects_empty`：4 个分支。
     - `test_ensure_unique_rejects_existing_dir`：用 `tmp_path` 预创建 `agents/<name>/`，调用 `ensure_unique` 期望 `SystemExit`。
     - `test_ensure_unique_rejects_already_registered`：在 `tmp_path/agents/__init__.py` 写入已含 `<name>` 的 `__all__`，调用期望 `SystemExit`。
     - `test_append_to_top_init_inserts_alphabetically`：在 `tmp_path/agents/__init__.py` 写入 `__all__ = ["zeta_agent"]` 与对应 import，调用 `append_to_top_init("alpha_agent")`，断言新 `__all__` 列表按字母序含两个名字。
     - `test_append_to_top_init_preserves_valid_python`：调用后 `compile(text, "<test>", "exec")` 不抛错。
5. 端到端烟测（手动，不在自动化中）：
   - `uv run python scripts/new_agent.py foo_agent` → 4 个新文件 + `tests/agents/__init__.py` + 改写后的 `agents/__init__.py`。
   - `AGENT_NAME=foo_agent uv run pytest tests/agents/test_foo_agent.py -q` → 通过。
   - `AGENT_NAME=foo_agent uv run uvicorn backend.main:app` → POST `/api/chat` 返回 200 且 `reply` 含 `placeholder:`。
   - 删除测试智能体：`rm -rf agents/foo_agent tests/agents/test_foo_agent.py` + 手动回滚 `agents/__init__.py` 3 行（`git checkout -- agents/__init__.py`）。

## 范围外（明确不做）

- 不生成 README / 文档文件（`agents/CLAUDE.md` 一行指引已够）。
- 不在 `pyproject.toml` 注册 `console_scripts` 入口（项目惯例是 `uv run python scripts/X.py`，与 `tests/conftest.py` 用法一致）。
- 不支持批量生成 / `--from-yaml` / 从现有 agent 复刻等当前用不到的能力。
- 不为占位 `placeholder_tool` 写专门测试（被加载测试间接覆盖；端到端烟测再确认）。
- 不在 `agents/<name>/tools.py` 留多工具示例（一个占位够用户起步，复制 `weather_agent/tools.py` 即可学习更多）。
- 不改 `agents/weather_agent/`（保持 surgical changes 原则）。
- 不引入 `click` / `typer` / `cookiecutter` 等第三方依赖。

## 后续可考虑

- 把 `name` 解析拆出 `--prefix` 与强制 `_agent` 后缀两种模式（当前统一要求 `_agent` 后缀足够清晰）。
- 在 `append_to_top_init` 之后打印 `git diff agents/__init__.py`，便于检视（当前一行打印 4 个新文件路径已够）。
- 是否把 `scripts/` 整目录排除出 wheel 打包（`pyproject.toml` 的 `setuptools.packages.find` 当前只 include `agents*`，所以 `scripts/` 不会被打进 wheel，无需调整）。
