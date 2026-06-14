# code_agent 复杂任务检测工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `detect_complex_task` tool to `code_agent` that the main LLM calls when the user request is non-trivial; the tool internally invokes the same `longcat` LLM to produce a structured JSON decomposition (`is_complex` / `reasoning` / `subtasks`) for the main LLM to execute.

**Architecture:** A new planning-style tool sits alongside the existing execution tools (`run_bash` / `run_read` / `run_write` / `run_edit`). Schemas live in `agents/code_agent/schemas.py` (Pydantic); the tool itself lives in `agents/code_agent/tools.py` and is registered in `agents/code_agent/agent.py`. The main LLM decides when to call it; the `system_prompt` is updated to nudge this behavior. Internal LLM call uses the project's existing `utils.langchain_model.get_singleton_client` (provider `longcat`).

**Tech Stack:** Python 3.13+, LangChain 1.x (`@tool`, `BaseTool.invoke`), Pydantic v2, pytest, ruff, mypy.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `agents/code_agent/schemas.py` | Modify | Add `DetectComplexTaskInput`, `Subtask`, `DecompositionResult` Pydantic models; extend `__all__`. |
| `agents/code_agent/tools.py` | Modify | Add imports (`logging`, `pydantic.ValidationError`, new schemas, `get_singleton_client`); add module constant `_DECOMPOSE_PROMPT` and `logger`; add `detect_complex_task` tool function. |
| `agents/code_agent/agent.py` | Modify | Import `detect_complex_task`; add to `tools=[...]`; replace `system_prompt` to encourage calling on non-trivial requests. |
| `tests/agents/test_code_agent.py` | Modify | Add `_FakeLLM` helper, `fake_llm` fixture, 5 new tests. |
| `agents/code_agent/__init__.py` | Unchanged | Tool is consumed only by the agent internally; not re-exported. |
| `agents/__init__.py` | Unchanged | No top-level re-export of the new tool. |
| `utils/langchain_model.py` | Unchanged | Reused via `get_singleton_client`. |

No new files. No new dependencies.

---

### Task 1: Add Pydantic schemas

**Files:**
- Modify: `agents/code_agent/schemas.py`

- [ ] **Step 1: Append three new models after the existing `EditInput` class (after line 33)**

Current file ends with the `EditInput` class and a blank line. Add the following three classes after `EditInput` and before the existing `__all__`:

```python
class DetectComplexTaskInput(BaseModel):
    """复杂任务检测输入。"""

    user_request: str = Field(description="用户的原始请求文本")


class Subtask(BaseModel):
    """单个子任务。"""

    id: int = Field(description="1 起始的子任务编号")
    title: str = Field(description="祈使句短标题")
    description: str = Field(description="1-2 句说明做什么")
    depends_on: list[int] = Field(
        default_factory=list, description="前置子任务 id 列表"
    )
    acceptance_criteria: list[str] = Field(
        default_factory=list, description="1-3 条验收点"
    )


class DecompositionResult(BaseModel):
    """任务拆解结果。"""

    is_complex: bool = Field(description="是否属于复杂任务")
    reasoning: str = Field(description="1-3 句判断理由")
    subtasks: list[Subtask] = Field(default_factory=list)
```

- [ ] **Step 2: Update `__all__` (currently lines 37-42) to include the new classes in alphabetical order**

Change:

```python
__all__ = [
    "BashInput",
    "EditInput",
    "ReadInput",
    "WriteInput",
]
```

to:

```python
__all__ = [
    "BashInput",
    "DecompositionResult",
    "DetectComplexTaskInput",
    "EditInput",
    "ReadInput",
    "Subtask",
    "WriteInput",
]
```

- [ ] **Step 3: Run ruff + mypy on the modified file**

Run:
```bash
uv run ruff format agents/code_agent/schemas.py
uv run ruff check --fix agents/code_agent/schemas.py
uv run mypy agents/code_agent/schemas.py
```

Expected: all three commands exit 0 with no output.

- [ ] **Step 4: Commit**

```bash
git add agents/code_agent/schemas.py
git commit -m "feat(code_agent): add DecompositionResult / Subtask / DetectComplexTaskInput schemas"
```

---

### Task 2: TDD `detect_complex_task` tool — write 4 failing tests

**Files:**
- Modify: `tests/agents/test_code_agent.py`

The test file currently contains only one test (`test_loads_agent`) and one autouse fixture. We append 4 tool unit tests + a fake-LLM helper.

- [ ] **Step 1: Append the `_FakeLLM` helper class and the `fake_llm` fixture at the bottom of the file**

```python
"""code_agent 加载与工具测试。"""

import json
from typing import Any

import pytest
from pydantic import BaseModel


@pytest.fixture(autouse=True)
def _reset_agent_cache() -> None:
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


# ---------------------------------------------------------------------------
# detect_complex_task 工具测试
# ---------------------------------------------------------------------------


class _FakeMessage:
    """模拟 langchain_core.messages.AIMessage 的 .content 接口。"""

    def __init__(self, content: str) -> None:
        self.content = content


class _FakeClient:
    """模拟 LangChain chat model 客户端；按需返回内容或抛异常。"""

    def __init__(self, fake: "_FakeLLM") -> None:
        self._fake = fake

    def invoke(self, prompt: str) -> _FakeMessage:
        self._fake.captured_prompts.append(prompt)
        response = self._fake.response
        if isinstance(response, Exception):
            raise response
        return _FakeMessage(response)


class _FakeLLM:
    """测试用可控 LLM：通过属性切换返回值/异常。"""

    def __init__(self) -> None:
        self.captured_prompts: list[str] = []
        self.response: str | Exception = json.dumps(
            {
                "is_complex": True,
                "reasoning": "需要改 3 个文件",
                "subtasks": [
                    {
                        "id": 1,
                        "title": "读 agent_loader",
                        "description": "理解现状",
                        "depends_on": [],
                        "acceptance_criteria": ["输出问题清单"],
                    }
                ],
            },
            ensure_ascii=False,
        )

    @property
    def client(self) -> _FakeClient:
        return _FakeClient(self)

    def set_response(self, response: str | Exception) -> None:
        self.response = response


@pytest.fixture
def fake_llm(monkeypatch: pytest.MonkeyPatch) -> _FakeLLM:
    """注入假 LLM 客户端到 agents.code_agent.tools 模块。"""
    import agents.code_agent.tools as tools_module

    fake = _FakeLLM()
    monkeypatch.setattr(
        tools_module, "get_singleton_client", lambda llm_provider: fake.client
    )
    return fake
```

- [ ] **Step 2: Append the 4 failing tool tests after the fixture**

```python
def test_detect_complex_task_returns_parsed_json(fake_llm: _FakeLLM) -> None:
    """合法 JSON 输入时, 工具返回结构化 JSON 字符串."""
    from agents.code_agent.tools import detect_complex_task

    result = detect_complex_task.invoke({"user_request": "重写 agents 加载逻辑"})

    parsed = json.loads(result)
    assert parsed["is_complex"] is True
    assert len(parsed["subtasks"]) == 1
    assert parsed["subtasks"][0]["title"] == "读 agent_loader"
    assert parsed["subtasks"][0]["depends_on"] == []


def test_detect_complex_task_simple_request(fake_llm: _FakeLLM) -> None:
    """is_complex=false 时 subtasks 为空列表."""
    from agents.code_agent.tools import detect_complex_task

    fake_llm.set_response(
        json.dumps(
            {"is_complex": False, "reasoning": "单一动作", "subtasks": []},
            ensure_ascii=False,
        )
    )

    result = detect_complex_task.invoke({"user_request": "看看 README"})

    parsed = json.loads(result)
    assert parsed["is_complex"] is False
    assert parsed["subtasks"] == []


def test_detect_complex_task_handles_invalid_json(fake_llm: _FakeLLM) -> None:
    """内部 LLM 返回非 JSON 时, 工具返 'Error: 内部 LLM 输出无法解析: ...'."""
    from agents.code_agent.tools import detect_complex_task

    fake_llm.set_response("not json at all")

    result = detect_complex_task.invoke({"user_request": "x"})

    assert result.startswith("Error: 内部 LLM 输出无法解析")


def test_detect_complex_task_handles_llm_failure(fake_llm: _FakeLLM) -> None:
    """内部 LLM 抛异常时, 工具返 'Error: 任务拆解失败: ...'."""
    from agents.code_agent.tools import detect_complex_task

    fake_llm.set_response(RuntimeError("网络断开"))

    result = detect_complex_task.invoke({"user_request": "x"})

    assert result.startswith("Error: 任务拆解失败")
    assert "网络断开" in result
```

- [ ] **Step 3: Run the 4 new tests to verify they fail (function not yet implemented)**

Run:
```bash
uv run pytest tests/agents/test_code_agent.py -v -k "detect_complex_task"
```

Expected: all 4 tests FAIL with `AttributeError: module 'agents.code_agent.tools' has no attribute 'detect_complex_task'`. The 5th test (`test_loads_agent`) should still pass.

- [ ] **Step 4: Commit the failing tests (TDD discipline)**

```bash
git add tests/agents/test_code_agent.py
git commit -m "test(code_agent): add 4 failing tests for detect_complex_task tool"
```

---

### Task 3: Implement `detect_complex_task` to make the 4 tests pass

**Files:**
- Modify: `agents/code_agent/tools.py`

- [ ] **Step 1: Extend the import block at the top of `tools.py` (currently lines 1-14)**

Change:

```python
"""code_agent 智能体可用工具集合。"""

import os
import subprocess
from pathlib import Path

from langchain_core.tools import tool

from agents.code_agent.schemas import (
    BashInput,
    EditInput,
    ReadInput,
    WriteInput,
)
```

to:

```python
"""code_agent 智能体可用工具集合。"""

import logging
import os
import subprocess
from pathlib import Path

from langchain_core.tools import tool
from pydantic import ValidationError

from agents.code_agent.schemas import (
    BashInput,
    DecompositionResult,
    DetectComplexTaskInput,
    EditInput,
    ReadInput,
    WriteInput,
    WriteInput,  # noqa: F811  (placeholder, removed next step)
)
from utils.langchain_model import get_singleton_client
```

(Note: the duplicate `WriteInput` line is intentional only for the diff; it is removed in the next sub-step. If applying as a single edit, omit the duplicate.)

Apply the import change in one Edit by replacing the original block (lines 1-14) with:

```python
"""code_agent 智能体可用工具集合。"""

import logging
import os
import subprocess
from pathlib import Path

from langchain_core.tools import tool
from pydantic import ValidationError

from agents.code_agent.schemas import (
    BashInput,
    DecompositionResult,
    DetectComplexTaskInput,
    EditInput,
    ReadInput,
    WriteInput,
)
from utils.langchain_model import get_singleton_client
```

- [ ] **Step 2: Add module-level `_DECOMPOSE_PROMPT` and `logger` constants after the `safe_path` function (after line 25)**

Insert (before the existing `run_bash` `@tool`):

```python
_DECOMPOSE_PROMPT = """你是任务拆解器。判断用户请求是否属于"复杂任务"——涉及多文件 / 设计权衡 / 目标模糊 / 多步串联。

严格按以下 JSON schema 返回，不要包含其他内容：
{{
  "is_complex": bool,
  "reasoning": "1-3 句判断理由",
  "subtasks": [
    {{
      "id": 1,
      "title": "祈使句短标题",
      "description": "1-2 句做什么",
      "depends_on": [前置 id 列表],
      "acceptance_criteria": ["1-3 条验收点"]
    }}
  ]
}}

若不复杂，返回：
{{"is_complex": false, "reasoning": "...", "subtasks": []}}

用户请求：
{user_request}
"""

logger = logging.getLogger(__name__)
```

- [ ] **Step 3: Append the `detect_complex_task` tool at the bottom of `tools.py` (after the `run_edit` function, after line 121)**

```python
@tool(args_schema=DetectComplexTaskInput)
def detect_complex_task(user_request: str) -> str:
    """判断用户请求是否属于复杂任务，若是则拆解为子任务列表.

    Args:
        user_request: 用户的原始请求文本

    Returns:
        包含 is_complex / reasoning / subtasks 字段的 JSON 字符串，
        或错误描述
    """
    try:
        client = get_singleton_client(llm_provider="longcat")
        prompt = _DECOMPOSE_PROMPT.format(user_request=user_request)
        response = client.invoke(prompt)
        result = DecompositionResult.model_validate_json(response.content)
    except (ValidationError, ValueError) as e:
        return f"Error: 内部 LLM 输出无法解析: {e}"
    except Exception as e:
        logger.exception("detect_complex_task 内部 LLM 调用失败")
        return f"Error: 任务拆解失败: {e}"
    return result.model_dump_json()
```

- [ ] **Step 4: Run the 4 tool tests to verify they now pass**

Run:
```bash
uv run pytest tests/agents/test_code_agent.py -v -k "detect_complex_task"
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Run full quality gates on the modified file**

Run:
```bash
uv run ruff format agents/code_agent/tools.py
uv run ruff check --fix agents/code_agent/tools.py
uv run mypy agents/code_agent/tools.py
```

Expected: all three exit 0. If mypy reports `Any` return from `get_singleton_client` on the `client = ...` line, it's pre-existing and acceptable (the variable is unused after the assignment; we call `client.invoke(...)`).

- [ ] **Step 6: Commit**

```bash
git add agents/code_agent/tools.py
git commit -m "feat(code_agent): implement detect_complex_task tool with inner LLM call"
```

---

### Task 4: TDD agent registration — write 1 failing test

**Files:**
- Modify: `tests/agents/test_code_agent.py`

- [ ] **Step 1: Append the registration test at the bottom of the file**

```python
def test_agent_registers_detect_complex_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """agent.py 构造的 code_agent 应注册 detect_complex_task 工具."""
    monkeypatch.setenv("AGENT_NAME", "code_agent")

    from agents.code_agent.agent import code_agent
    from agents.code_agent.tools import detect_complex_task

    found = False
    for node in code_agent.nodes.values():
        runnable = (
            getattr(node, "runnable", None)
            or getattr(node, "data", None)
            or node
        )
        tools_by_name = getattr(runnable, "tools_by_name", None)
        if tools_by_name and "detect_complex_task" in tools_by_name:
            assert tools_by_name["detect_complex_task"] is detect_complex_task
            found = True
            break
    assert found, "detect_complex_task 未注册到 code_agent 的 ToolNode"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
uv run pytest tests/agents/test_code_agent.py::test_agent_registers_detect_complex_task -v
```

Expected: FAIL with `AssertionError: detect_complex_task 未注册到 code_agent 的 ToolNode` (the agent currently does not import the tool).

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/agents/test_code_agent.py
git commit -m "test(code_agent): assert detect_complex_task is registered"
```

---

### Task 5: Wire up `code_agent` to register the tool and update the system prompt

**Files:**
- Modify: `agents/code_agent/agent.py`

- [ ] **Step 1: Replace the `tools` import (currently line 5)**

Change:

```python
from agents.code_agent.tools import run_bash, run_read, run_write
```

to:

```python
from agents.code_agent.tools import (
    detect_complex_task,
    run_bash,
    run_read,
    run_write,
)
```

- [ ] **Step 2: Add `detect_complex_task` to the `tools=[...]` list (currently line 12)**

Change:

```python
    tools=[run_bash, run_read, run_write],
```

to:

```python
    tools=[run_bash, run_read, run_write, detect_complex_task],
```

- [ ] **Step 3: Replace the `system_prompt` (currently line 14)**

Change:

```python
    system_prompt="You are a helpful assistant",
```

to:

```python
    system_prompt=(
        "You are a code agent.\n"
        "\n"
        "When the user request is non-trivial (multi-file, design "
        "decisions, ambiguous goals, or many sequential steps), call "
        "`detect_complex_task` first to get a structured plan, then "
        "execute subtasks one at a time.\n"
        "\n"
        "For simple, single-step requests, act directly."
    ),
```

- [ ] **Step 4: Run the registration test to verify it now passes**

Run:
```bash
uv run pytest tests/agents/test_code_agent.py::test_agent_registers_detect_complex_task -v
```

Expected: PASS.

- [ ] **Step 5: Run full quality gates on `agent.py`**

Run:
```bash
uv run ruff format agents/code_agent/agent.py
uv run ruff check --fix agents/code_agent/agent.py
uv run mypy agents/code_agent/agent.py
```

Expected: all three exit 0.

- [ ] **Step 6: Commit**

```bash
git add agents/code_agent/agent.py
git commit -m "feat(code_agent): register detect_complex_task and update system prompt"
```

---

### Task 6: Final verification

- [ ] **Step 1: ruff format (whole repo)**

Run: `uv run ruff format .`
Expected: no diff, or only trivial formatting in files we just modified.

- [ ] **Step 2: ruff check (whole repo, with autofix)**

Run: `uv run ruff check --fix .`
Expected: clean output.

- [ ] **Step 3: mypy (whole repo)**

Run: `uv run mypy .`
Expected: clean output.

- [ ] **Step 4: pytest (whole repo)**

Run: `uv run pytest -v`
Expected: all tests pass — including the 5 new ones in `tests/agents/test_code_agent.py` and the previously existing `test_loads_agent`.

- [ ] **Step 5: Verify the 5 new tests are present and named correctly**

Run: `uv run pytest tests/agents/test_code_agent.py --collect-only -q`
Expected: lists 6 test items (1 pre-existing + 5 new):
- `test_loads_agent`
- `test_detect_complex_task_returns_parsed_json`
- `test_detect_complex_task_simple_request`
- `test_detect_complex_task_handles_invalid_json`
- `test_detect_complex_task_handles_llm_failure`
- `test_agent_registers_detect_complex_task`

- [ ] **Step 6: Commit any auto-fixups**

If Steps 1-3 produced changes:

```bash
git add -u
git commit -m "style: ruff/mypy cleanup after detect_complex_task integration"
```

If clean, skip this step.

---

## Self-Review

**Spec coverage:**

- §components / `schemas.py` (3 new classes + `__all__`) → Task 1.
- §components / `tools.py` (imports, `_DECOMPOSE_PROMPT`, `logger`, `detect_complex_task` function) → Task 3.
- §components / `agent.py` (import, register, `system_prompt`) → Task 5.
- §components / `__init__.py` unchanged → confirmed (no task touches it).
- §data flow (main LLM → `detect_complex_task` → inner LLM → JSON → main LLM) → covered by Task 2 (4 unit tests) + Task 4 (registration) + Task 5 step 4 (registration test passes).
- §error handling: `ValidationError` / `ValueError` path (Task 3 step 3 + Task 2 test 3), generic `Exception` + `logger.exception` path (Task 3 step 3 + Task 2 test 4).
- §validation standards (ruff / mypy / pytest) → Task 6.
- §scope ("明确不做"): no middleware, no `__init__.py` exports, no new provider, no `run_edit` re-registration, no agent source rewrites — all observed across Tasks 1, 3, 5 (none of these touch the forbidden surface).

**Placeholder scan:** No TBD / TODO / "fill in" markers. Every step shows full code or exact commands. The `WriteInput,  # noqa: F811` duplicate-import line in Task 3 step 1 is explicitly flagged as a "diff-only" artifact and immediately corrected in the same step; the final state of the file has no duplicate imports.

**Type consistency:**

- `DetectComplexTaskInput.user_request: str` used in Task 2 tests, Task 3 implementation, and matches the spec.
- `Subtask` / `DecompositionResult` field names (`id`, `title`, `description`, `depends_on`, `acceptance_criteria` / `is_complex`, `reasoning`, `subtasks`) consistent across Task 1 schemas, Task 2 fake JSON, Task 3 implementation, and the spec.
- `get_singleton_client(llm_provider="longcat")` signature consistent with `agent.py` (same provider string).
- `detect_complex_task.invoke({"user_request": ...})` consistent in Task 2 tests and Task 4 test.
- `_FakeLLM.captured_prompts` / `set_response` / `response` attributes are only used in Task 2 (helper definition) and Task 2 (tests) — no Task references an attribute name that doesn't exist.
- `fake_llm` fixture is autouse-free; explicitly requested only by the 4 tool tests in Task 2 and the registration test in Task 4 (which does NOT request it, since it tests registration, not tool execution).
