# get_weather args_schema 化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `agents/weather_agent/tools.py` 中的 `get_weather` 从裸函数迁移到 `@tool(args_schema=WeatherInput)` 模式，函数体与对外行为保持不变。

**Architecture:** 仅修改 `tools.py` 一个文件，新增 `WeatherInput(BaseModel)` 显式声明 schema，用 `@tool(args_schema=WeatherInput)` 装饰原函数。`agent.py` 与 `__init__.py` 不动；`create_agent(tools=[get_weather])` 接受装饰后的对象。

**Tech Stack:** LangChain 1.3+（`langchain_core.tools.tool`）、Pydantic v2（`pydantic.BaseModel` / `Field`）。

---

## File Structure

仅修改一个文件：

- `agents/weather_agent/tools.py` — 增加 `WeatherInput` BaseModel + `@tool` 装饰器；函数体不变。

不创建新文件、不改动 `agent.py` / `__init__.py` / `pyproject.toml` / 任何测试文件。

---

## Task 1: 重写 tools.py 为 args_schema 模式

**Files:**
- Modify: `agents/weather_agent/tools.py`（全量改写，文件共 14 行）

- [ ] **Step 1: 替换 tools.py 文件内容**

将 `agents/weather_agent/tools.py` 的全部内容替换为：

```python
"""天气智能体可用工具集合。"""

from langchain_core.tools import tool
from pydantic import BaseModel, Field


class WeatherInput(BaseModel):
    """天气查询输入参数。"""

    city: str = Field(description="城市名称")


@tool(args_schema=WeatherInput)
def get_weather(city: str) -> str:
    """获取指定城市的天气信息（占位实现）.

    Args:
        city: 城市名称

    Returns:
        天气描述字符串
    """
    return f"It's always sunny in {city}!"
```

> 说明：
> - `tool` 来自 `langchain_core.tools`（项目已装 `langchain>=1.3.7`，实测可用）。
> - `WeatherInput` 只保留现有 `city` 字段，不引入示例里的 `units` / `include_forecast`。
> - `Field.description` 用中文（项目 `python.md` 规范）。
> - 函数体、`return` 字符串、中文 docstring 全部保持原状。

- [ ] **Step 2: 运行 ruff format**

```bash
uv run ruff format .
```

Expected: 无变更输出（或仅 `tools.py` 的 import 顺序被调整，2 行内）。如果出现其他文件被格式化，记下来后续单独 commit。

- [ ] **Step 3: 运行 ruff check**

```bash
uv run ruff check --fix .
```

Expected: `All checks passed!`。如出现 warning，先在本任务里处理；不引入新规则豁免。

- [ ] **Step 4: 运行 mypy**

```bash
uv run mypy .
```

Expected: `Success: no issues found in N source files`。`WeatherInput` 字段已显式带类型，`@tool` 装饰后 mypy 应能通过。

- [ ] **Step 5: 运行 pytest 验证端到端未坏**

```bash
uv run pytest
```

Expected: 全部测试通过（特别是 `tests/test_backend.py::test_chat_weather` 仍能 200 返回含城市名的 reply）。这等价于验证：`tools.py` 重写后 `weather_agent` 装配未被打断、工具 schema 能被 LLM 消费。

- [ ] **Step 6: 提交**

```bash
git add agents/weather_agent/tools.py
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
refactor(weather_agent): migrate get_weather to @tool args_schema

Wrap get_weather with @tool(args_schema=WeatherInput) and declare the
input schema via a Pydantic BaseModel. Function body and behavior
unchanged; agent.py and __init__.py untouched.
EOF
)"
git status --short
```

Expected: 提交后 `git status` 仅剩与本任务无关的 `M jupyter/weather-agent.ipynb`（既有未提交改动，不在本次范围）。

---

## Self-Review

对照 spec 逐项检查：

1. **Spec coverage**
   - "新增 `WeatherInput(BaseModel)`，仅一个字段 `city: str`" → Task 1 Step 1 已包含。✓
   - "用 `@tool(args_schema=WeatherInput)` 装饰" → Task 1 Step 1 已包含。✓
   - "导入用 `langchain_core.tools.tool`" → Task 1 Step 1 已包含。✓
   - "函数体一行不变" → Task 1 Step 1 的 `return` 与原文件一致。✓
   - "中文 docstring / Field description" → Task 1 Step 1 已包含。✓
   - 验证标准 1–4（ruff format / ruff check / mypy / pytest）→ Task 1 Step 2–5 一一对应。✓
   - "不写新单元测试" → 全计划不创建测试文件。✓

2. **Placeholder scan**
   - 全文无 TBD / TODO / "implement later" / "类似 Task N"。
   - 所有代码步骤均含完整代码块；所有命令含完整命令与预期输出。

3. **Type / 命名一致性**
   - `WeatherInput` 仅在 Task 1 Step 1 出现一次，无后续任务使用。✓
   - `get_weather` 函数签名 `(city: str) -> str` 在 spec 与本计划中保持一致。✓

无遗漏，无歧义，可执行。
