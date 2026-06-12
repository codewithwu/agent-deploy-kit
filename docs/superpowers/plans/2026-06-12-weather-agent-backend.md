# Weather Agent FastAPI Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `agent-deploy-kit` 仓库新增一个最小可运行的 FastAPI 后端，将 `agents/weather_agent/agent.py` 中的 `weather_agent` 暴露为 `POST /api/chat`，并附带 `GET /health` 与 pytest 烟测。

**Architecture:** 单文件 `backend/main.py` 持有 FastAPI app：顶层导入 `weather_agent`（其 LLM 客户端已通过 `get_singleton_client` 缓存），用 Pydantic 校验 `messages`，调 `weather_agent.invoke`，提取最后一条消息的 `content` 作为 `reply`。错误用 `HTTPException`。`tests/test_backend.py` 用 `TestClient` 跑两个用例（不 mock LLM）。

**Tech Stack:** Python 3.13+ / FastAPI 0.136 / Pydantic v2 / pytest 9 / LangChain 1.3（`create_agent`）/ `uv` 运行。

**Prerequisites (一次性确认)：**
- 仓库根目录运行（确保 `agents/`、`utils/` 可被绝对导入）。
- `.env` 中已配置 `LONGCAT_API_KEY` / `LONGCAT_BASEURL` / `LONGCAT_MODEL_NAME`（`agent.py` 用 `llm_provider="longcat"`）。
- `.venv` 已存在（`tooling.md` 注明）。所有命令用 `uv run`。

---

## File Structure

| 文件 | 状态 | 职责 |
|---|---|---|
| `backend/__init__.py` | 新建 | 空包，声明 `__all__: list[str] = []` |
| `backend/main.py` | 新建 | FastAPI app + CORS + `GET /health` + `POST /api/chat` |
| `tests/__init__.py` | 新建 | 空包，使 `tests` 成为可导入包 |
| `tests/test_backend.py` | 新建 | `TestClient` 烟测 3 个用例：`/health`、`/api/chat` 成功、`/api/chat` 空消息 |

不动：`agents/`、`utils/`、`pyproject.toml`、`code_map.md`、`.env`。

---

## Task 1: 包骨架与 import 烟测

**Files:**
- Create: `backend/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/test_imports.py`（临时烟雾测试，Task 2 后会删/扩展）

- [ ] **Step 1: 创建 `backend/__init__.py`**

```python
"""FastAPI 后端包。"""

__all__: list[str] = []
```

- [ ] **Step 2: 创建 `tests/__init__.py`**

```python
"""测试包。"""

__all__: list[str] = []
```

- [ ] **Step 3: 写一个临时 import 烟测**

创建 `tests/test_imports.py`：

```python
"""临时烟测：验证 backend 包可被绝对导入。"""

from backend import main  # noqa: F401
```

> 这一步是 TDD 的"红"：先建一个失败的测试，Task 3 才会真正写出能 import 的 `main.py`。

- [ ] **Step 4: 运行测试确认失败**

Run: `uv run pytest tests/test_imports.py -v`
Expected: FAIL，错误信息含 `ModuleNotFoundError: No module named 'backend'` 或 `backend.main`。

- [ ] **Step 5: 提交骨架**

```bash
git add backend/__init__.py tests/__init__.py tests/test_imports.py
git commit -m "test(backend): scaffold backend/ and tests/ packages with failing import smoke test"
```

---

## Task 2: 实现最小 FastAPI app 让 /health 测试通过

**Files:**
- Create: `backend/main.py`
- Modify: `tests/test_imports.py` → 改名为 `tests/test_backend.py`，扩展为 `/health` 测试

- [ ] **Step 1: 实现 `backend/main.py` 的最小可用版本**

```python
"""Weather Agent FastAPI 后端."""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Weather Agent API", version="0.1.0")


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
```

> 暂时不加 CORS / `/api/chat`，让 import 烟测和 `/health` 测试先红后绿。

- [ ] **Step 2: 删除临时 import 测试文件，新建正式的 `tests/test_backend.py`**

```bash
rm tests/test_imports.py
```

新建 `tests/test_backend.py`：

```python
"""Backend 端到端烟测。"""

from fastapi.testclient import TestClient

from backend.main import app


def test_health() -> None:
    """GET /health 返回 200 与 {"status": "ok"}。"""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: 运行测试确认 /health 通过**

Run: `uv run pytest tests/test_backend.py -v`
Expected: PASS，`test_health` 1 passed.

- [ ] **Step 4: 提交**

```bash
git add backend/main.py tests/test_backend.py
git commit -m "feat(backend): add minimal FastAPI app with /health endpoint"
```

---

## Task 3: 为 /api/chat 写失败测试

**Files:**
- Modify: `tests/test_backend.py`

- [ ] **Step 1: 在 `tests/test_backend.py` 末尾追加失败测试**

在文件末尾追加（保留 `test_health`）：

```python
def test_chat_weather() -> None:
    """POST /api/chat 调用 weather_agent 回答旧金山天气,reply 含城市名。"""
    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "messages": [
                {"role": "user", "content": "What's the weather in San Francisco?"}
            ]
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "reply" in body
    assert "San Francisco" in body["reply"]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `uv run pytest tests/test_backend.py -v`
Expected: FAIL，`test_chat_weather` 报 404 / 405（端点不存在）。

- [ ] **Step 3: 提交红色测试**

```bash
git add tests/test_backend.py
git commit -m "test(backend): add failing test for /api/chat weather query"
```

---

## Task 4: 实现 /api/chat 端点让测试通过

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: 在 `backend/main.py` 中实现 `/api/chat`**

把整个文件替换为：

```python
"""Weather Agent FastAPI 后端."""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from agents.weather_agent import weather_agent


class HealthResponse(BaseModel):
    status: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str


app = FastAPI(title="Weather Agent API", version="0.1.0")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    try:
        result = weather_agent.invoke(
            {"messages": [m.model_dump() for m in request.messages]}
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    messages = result.get("messages", [])
    if not messages:
        raise HTTPException(status_code=500, detail="agent returned no messages")

    reply = getattr(messages[-1], "content", "") or ""
    return ChatResponse(reply=reply)
```

> 注：`ChatRequest.messages` 不在 Pydantic 层做 `min_length`，把"空消息 → 400"留到端点逻辑里，保证错误响应体一致。

- [ ] **Step 2: 运行测试**

Run: `uv run pytest tests/test_backend.py -v`
Expected: PASS，两个测试都过。`test_chat_weather` 会真的调一次 LongCat LLM，**预计 10-30 秒**。

- [ ] **Step 3: 提交**

```bash
git add backend/main.py
git commit -m "feat(backend): implement /api/chat wrapping weather_agent"
```

---

## Task 5: 添加 CORS + 空消息 400 测试

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_backend.py`

- [ ] **Step 1: 在 `tests/test_backend.py` 追加空消息测试**

在文件末尾追加：

```python
def test_chat_empty_messages_returns_400() -> None:
    """空 messages 列表应返回 400 而非 422。"""
    client = TestClient(app)
    response = client.post("/api/chat", json={"messages": []})
    assert response.status_code == 400
    assert response.json()["detail"] == "messages must not be empty"
```

- [ ] **Step 2: 暂时跳过这个新测试，先为 CORS 写测试**

> 调换顺序：先实现 CORS + 测试 CORS 头，再让"空消息 400"测试自然通过（端点逻辑已在 Task 4 写好）。

- [ ] **Step 3: 在 `tests/test_backend.py` 追加 CORS 头测试**

在文件末尾追加：

```python
def test_cors_allows_any_origin() -> None:
    """开发期 CORS 应对任意 Origin 放行。"""
    client = TestClient(app)
    response = client.get(
        "/health", headers={"Origin": "http://localhost:5173"}
    )
    assert response.headers.get("access-control-allow-origin") == "*"
```

- [ ] **Step 4: 运行两个新测试，确认 CORS 测试失败（CORS 还没加）**

Run: `uv run pytest tests/test_backend.py -v`
Expected: `test_chat_empty_messages_returns_400` PASS，`test_cors_allows_any_origin` FAIL（无 `access-control-allow-origin` 头）。

- [ ] **Step 5: 在 `backend/main.py` 中加入 CORS 中间件**

把 `backend/main.py` 改为：

```python
"""Weather Agent FastAPI 后端."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents.weather_agent import weather_agent


class HealthResponse(BaseModel):
    status: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str


app = FastAPI(title="Weather Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    try:
        result = weather_agent.invoke(
            {"messages": [m.model_dump() for m in request.messages]}
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    messages = result.get("messages", [])
    if not messages:
        raise HTTPException(status_code=500, detail="agent returned no messages")

    reply = getattr(messages[-1], "content", "") or ""
    return ChatResponse(reply=reply)
```

- [ ] **Step 6: 运行所有测试**

Run: `uv run pytest tests/test_backend.py -v`
Expected: PASS，全部 4 个测试过。

- [ ] **Step 7: 提交**

```bash
git add backend/main.py tests/test_backend.py
git commit -m "feat(backend): add permissive CORS + empty-messages and cors tests"
```

---

## Task 6: 质量门（ruff + mypy + 手动 curl 烟测）

**Files:** 无新增。

- [ ] **Step 1: ruff 格式化**

Run: `uv run ruff format .`
Expected: 无变更（如果改了，下一步会看到 diff）。如有变更：

```bash
git add -u
git commit -m "style: apply ruff format"
```

- [ ] **Step 2: ruff 检查**

Run: `uv run ruff check --fix .`
Expected: "All checks passed!"。如有自动修复：

```bash
git add -u
git commit -m "style: apply ruff --fix"
```

- [ ] **Step 3: mypy 类型检查**

Run: `uv run mypy .`
Expected: "Success: no issues found in N source files"。如有错误，逐个修；不绕过（不写 `type: ignore` 除非真的无法解决且注释说明原因）。

- [ ] **Step 4: 完整测试再跑一次**

Run: `uv run pytest tests/test_backend.py -v`
Expected: 4 passed.

- [ ] **Step 5: 启动 uvicorn 手动 curl 验证**

启动服务（后台）：

```bash
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

另开终端：

```bash
curl -s http://127.0.0.1:8765/health
# 期望: {"status":"ok"}

curl -s -X POST http://127.0.0.1:8765/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"What is the weather in Tokyo?"}]}'
# 期望: {"reply":"...Tokyo..."}
```

- [ ] **Step 6: 停掉后台服务**

在前台 shell 里 Ctrl-C，或 `pkill -f "uvicorn backend.main:app"`。

- [ ] **Step 7: 收尾提交（如果有 step 1-3 留下的修改）**

```bash
git status
```

如有未提交改动：

```bash
git add -u
git commit -m "chore: post-quality-gate fixes"
```

---

## Acceptance Criteria

1. `uv run ruff format .` 不产生新 diff。
2. `uv run ruff check .` 全过。
3. `uv run mypy .` 全过。
4. `uv run pytest tests/test_backend.py` 4 passed。
5. `uv run uvicorn backend.main:app` 启动后，`curl /health` 与 `curl /api/chat` 行为如预期。
6. 仓库 git 历史新增 5-6 个提交，每步独立可回滚。
