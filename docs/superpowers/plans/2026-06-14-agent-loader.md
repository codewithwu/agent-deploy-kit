# Backend Agent Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `weather_agent` import in `backend/main.py` with a dynamic loader that picks the agent at startup from the `AGENT_NAME` env var, fail-fast on misconfiguration.

**Architecture:** New `backend/agent_loader.py` exposes a single cached `get_agent()` function. `backend/main.py` calls it once at module load. New `tests/conftest.py` sets `AGENT_NAME=weather_agent` as the default for the test suite. New `tests/test_agent_loader.py` covers env-missing, happy-path, caching, and unknown-name cases.

**Tech Stack:** Python 3.13+, FastAPI, LangChain 1.x, pytest, ruff, mypy.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `backend/agent_loader.py` | New | `get_agent()` — reads `AGENT_NAME`, imports `agents.<name>.agent`, returns the instance, cached. |
| `backend/main.py` | Modify | Replace hardcoded import; call `get_agent()` at module load; rename `weather_agent` → `agent` at call sites. |
| `tests/conftest.py` | New | Set `AGENT_NAME=weather_agent` default for pytest collection. |
| `tests/test_agent_loader.py` | New | 4 unit tests for `get_agent()`. |
| `agents/__init__.py` | Unchanged | Loader bypasses this file's hardcoded `weather_agent`. |
| `agents/<name>_agent/` | Unchanged | Loader reads these; no source changes. |

---

### Task 1: Add conftest.py with default AGENT_NAME

**Files:**
- Create: `tests/conftest.py`

`test_backend.py` imports `from backend.main import app`, which (after Task 6) triggers `get_agent()` at module load. Without `AGENT_NAME` set, the loader raises `RuntimeError` and the test process dies. We need conftest to set the env before any test file is collected.

- [ ] **Step 1: Create `tests/conftest.py`**

```python
"""测试套件全局配置：默认 AGENT_NAME=weather_agent。

backend.main 启动时调用 get_agent() 读取 AGENT_NAME；本兜底确保 pytest
收集阶段该 env 存在，import chain 不爆。
"""

import os

os.environ.setdefault("AGENT_NAME", "weather_agent")
```

- [ ] **Step 2: Verify pytest collection picks up conftest**

Run: `uv run pytest --collect-only -q 2>&1 | head -20`
Expected: lists test items from `tests/` without import errors. No `ModuleNotFoundError` / `RuntimeError`.

- [ ] **Step 3: Confirm existing e2e tests still pass (conftest is inert until main.py is wired)**

Run: `uv run pytest tests/test_backend.py -v`
Expected: all 6 existing tests pass. The env value is set but unused — `main.py` still hardcodes `weather_agent` import.

- [ ] **Step 4: Commit**

```bash
git add tests/conftest.py
git commit -m "test: set AGENT_NAME=weather_agent default in conftest"
```

---

### Task 2: TDD get_agent() — first test (missing env)

**Files:**
- Create: `tests/test_agent_loader.py`
- Create: `backend/agent_loader.py`

- [ ] **Step 1: Create test file with cache-reset fixture and the first test**

```python
"""agent_loader 单元测试。"""

import pytest


@pytest.fixture(autouse=True)
def _reset_agent_cache() -> None:
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_agent_loader.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.agent_loader'`.

- [ ] **Step 3: Create `backend/agent_loader.py`**

```python
"""按 AGENT_NAME 环境变量从 agents/ 动态加载智能体实例。"""

import importlib
import os
from functools import lru_cache

__all__: list[str] = ["get_agent"]

_AGENT_NAME_ENV = "AGENT_NAME"


@lru_cache(maxsize=1)
def get_agent() -> object:
    name = os.environ.get(_AGENT_NAME_ENV)
    if not name:
        raise RuntimeError(f"{_AGENT_NAME_ENV} is not set")
    module = importlib.import_module(f"agents.{name}.agent")
    instance = getattr(module, name, None)
    if instance is None:
        raise RuntimeError(
            f"agents.{name}.agent has no attribute {name!r}"
        )
    return instance
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_agent_loader.py::test_missing_env_raises_runtime_error -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/test_agent_loader.py backend/agent_loader.py
git commit -m "feat(backend): add agent_loader.get_agent() with env validation"
```

---

### Task 3: Add happy-path test (loads weather_agent)

**Files:**
- Modify: `tests/test_agent_loader.py`

- [ ] **Step 1: Append test to `tests/test_agent_loader.py`**

```python
def test_loads_weather_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """AGENT_NAME=weather_agent 时返回 weather_agent 实例。"""
    monkeypatch.setenv("AGENT_NAME", "weather_agent")

    from agents.weather_agent import weather_agent
    from backend.agent_loader import get_agent

    assert get_agent() is weather_agent
```

- [ ] **Step 2: Run test to verify it passes**

Run: `uv run pytest tests/test_agent_loader.py::test_loads_weather_agent -v`
Expected: PASS (impl already supports the happy path; this locks it in).

- [ ] **Step 3: Commit**

```bash
git add tests/test_agent_loader.py
git commit -m "test(agent_loader): verify AGENT_NAME=weather_agent returns instance"
```

---

### Task 4: Add caching test

**Files:**
- Modify: `tests/test_agent_loader.py`

- [ ] **Step 1: Append test**

```python
def test_caches_result(monkeypatch: pytest.MonkeyPatch) -> None:
    """多次调用 get_agent() 应返回同一实例（lru_cache 命中）。"""
    monkeypatch.setenv("AGENT_NAME", "weather_agent")

    from backend.agent_loader import get_agent

    assert get_agent() is get_agent()
```

- [ ] **Step 2: Run test to verify it passes**

Run: `uv run pytest tests/test_agent_loader.py::test_caches_result -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_agent_loader.py
git commit -m "test(agent_loader): verify lru_cache returns same instance"
```

---

### Task 5: Add unknown-name test

**Files:**
- Modify: `tests/test_agent_loader.py`

- [ ] **Step 1: Append test**

```python
def test_unknown_name_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """AGENT_NAME=不存在的子包 时 importlib 抛 ModuleNotFoundError。"""
    monkeypatch.setenv("AGENT_NAME", "no_such_agent_xyz")

    from backend.agent_loader import get_agent

    with pytest.raises(ModuleNotFoundError):
        get_agent()
```

- [ ] **Step 2: Run test to verify it passes**

Run: `uv run pytest tests/test_agent_loader.py::test_unknown_name_raises -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_agent_loader.py
git commit -m "test(agent_loader): verify unknown agent name raises ModuleNotFoundError"
```

---

### Task 6: Wire up backend/main.py to use agent_loader

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Replace the hardcoded import (currently line 14)**

Change:

```python
from agents.weather_agent import weather_agent
from backend.schemas import ChatRequest, ChatResponse, HealthResponse
```

to:

```python
from backend.agent_loader import get_agent
from backend.schemas import ChatRequest, ChatResponse, HealthResponse
```

- [ ] **Step 2: Add eager `get_agent()` call right after `logger` (after line 17)**

Add a new line after `logger = logging.getLogger(__name__)`:

```python
agent = get_agent()  # 启动期主动加载；env/模块错误在此抛出
```

The blank line between the new line and `_sse` should be preserved.

- [ ] **Step 3: Replace `weather_agent.stream` with `agent.stream` (currently line 34)**

Change:

```python
        for chunk in weather_agent.stream(
```

to:

```python
        for chunk in agent.stream(
```

- [ ] **Step 4: Replace `weather_agent.invoke` with `agent.invoke` (currently line 76)**

Change:

```python
        result = weather_agent.invoke(
```

to:

```python
        result = agent.invoke(
```

- [ ] **Step 5: Verify no `weather_agent` references remain in main.py**

Run: `grep -n "weather_agent" backend/main.py`
Expected: no output.

- [ ] **Step 6: Run full test suite**

Run: `uv run pytest -v`
Expected: all tests pass. conftest provides `AGENT_NAME=weather_agent`; `main.py` loads it at import via `get_agent()`; existing e2e tests work as before.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py
git commit -m "refactor(backend): use agent_loader to load agent dynamically"
```

---

### Task 7: Final quality gates

- [ ] **Step 1: ruff format**

Run: `uv run ruff format .`
Expected: no diff, or only trivial formatting in newly added files.

- [ ] **Step 2: ruff check (with autofix)**

Run: `uv run ruff check --fix .`
Expected: clean output.

- [ ] **Step 3: mypy**

Run: `uv run mypy .`
Expected: clean output. If `get_agent() -> object` produces an `Any`-return warning that ruff/mypy flags in `main.py`'s `.stream(...)` / `.invoke(...)` calls, narrow the return type on the loader to `Any` (still no langchain import) and re-run.

- [ ] **Step 4: pytest (final)**

Run: `uv run pytest -v`
Expected: all tests pass.

- [ ] **Step 5: Manual fail-fast smoke (optional but recommended)**

```bash
AGENT_NAME=does_not_exist uv run uvicorn backend.main:app
```
Expected: process exits with `ModuleNotFoundError: No module named 'agents.does_not_exist.agent'` before serving any request.

- [ ] **Step 6: Commit any fixups**

If Steps 1-3 produced changes:

```bash
git add -u
git commit -m "style: ruff/mypy cleanup after agent_loader integration"
```

If clean, skip this step.

---

## Self-Review

**Spec coverage:**

- §background / goal → covered by Task 2 (loader existence) and Task 6 (wiring).
- §components / `agent_loader.py` → covered by Tasks 2-5.
- §components / `main.py` → covered by Task 6.
- §components / `conftest.py` → covered by Task 1.
- §data flow → covered by Task 6 step 6 + Task 7 step 5.
- §error handling: missing env (Task 2), unknown name (Task 5), no-attribute branch (impl in Task 2 step 3, untested per spec YAGNI).
- §validation standards (ruff/mypy/pytest) → Task 7.
- §scope ("明确不做") → all observed (no per-request switching, no config file, no CLI, no `agents/__init__.py` change, no agent source changes).

**Placeholder scan:** no TBD / TODO / "fill in" markers. Every step shows full code or exact commands.

**Type consistency:** `get_agent() -> object` consistent across all tasks. Local var name `agent` in `main.py` consistent with spec §3.
