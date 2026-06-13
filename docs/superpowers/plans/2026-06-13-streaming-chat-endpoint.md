# /api/chat/stream SSE 端点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/chat/stream` to `backend/main.py` that forwards `weather_agent.stream(stream_mode='updates', version='v2')` step chunks as Server-Sent Events, while keeping the existing `POST /api/chat` unchanged.

**Architecture:** Single new endpoint in `backend/main.py` that returns a `StreamingResponse` driven by a small async generator. The generator wraps the existing sync LangChain stream, takes the last message's `content_blocks` from each step, and serializes them as `event: step` / `event: done` / `event: error` SSE frames. Three new pytest cases use `TestClient.stream()` to assert headers, the 400 path, and the full happy-path event sequence.

**Tech Stack:** FastAPI `StreamingResponse`, `uuid.uuid4`, `json`, `logging`, `collections.abc.AsyncIterator`. Tests: `fastapi.testclient.TestClient`.

---

## File Structure

No new files. Two existing files are modified:

| File | Change |
|---|---|
| `backend/main.py` | Add `_sse()` helper, `event_generator()` async generator, `chat_stream` endpoint, and 5 new stdlib/third-party imports. |
| `tests/test_backend.py` | Add `_parse_sse_events()` test helper and 3 new test cases. |
| `code_map.md` | Add `/api/chat/stream` to the backend `main.py` comment so the map stays in sync. |

---

## Task 1: 端点骨架 + 两个快速反馈用例

**Files:**
- Modify: `backend/main.py` (add 5 imports + `chat_stream` endpoint stub)
- Modify: `tests/test_backend.py` (add 2 tests: headers + 400)

- [ ] **Step 1: 在 `tests/test_backend.py` 顶部加 2 个新测试**

在文件末尾追加：

```python
def test_stream_returns_event_stream_headers() -> None:
    """POST /api/chat/stream 响应头应为 SSE。"""
    client = TestClient(app)
    with client.stream(
        "POST",
        "/api/chat/stream",
        json={"messages": [{"role": "user", "content": "hi"}]},
    ) as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["cache-control"] == "no-store"


def test_stream_empty_messages_returns_400() -> None:
    """空 messages 列表应返回 400 而非 422。"""
    client = TestClient(app)
    response = client.post("/api/chat/stream", json={"messages": []})
    assert response.status_code == 400
    assert response.json()["detail"] == "messages must not be empty"
```

- [ ] **Step 2: 跑测试，确认 404**

Run: `uv run pytest tests/test_backend.py::test_stream_returns_event_stream_headers tests/test_backend.py::test_stream_empty_messages_returns_400 -v`
Expected: 两条都 FAIL；`test_stream_returns_event_stream_headers` 报 404，`test_stream_empty_messages_returns_400` 同样 404。错误信息里能看到 "POST /api/chat/stream" 之类。

- [ ] **Step 3: 在 `backend/main.py` 加 5 个新 import**

在现有 import 块**下方**新增（不要动原有 import；让 ruff isort 自动整理）：

```python
import json
import logging
from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi.responses import StreamingResponse
```

- [ ] **Step 4: 在 `backend/main.py` 文件顶部加模块 logger**

紧跟 import 块之后、`app = FastAPI(...)` 之前新增：

```python
logger = logging.getLogger(__name__)
```

- [ ] **Step 5: 在 `backend/main.py` 末尾追加端点骨架（先不接 event_generator）**

在最后一个 `@app.post("/api/chat", ...)` 端点**之后**追加：

```python
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    # Task 1 阶段先返回空 body,仅验证响应头与 400 路径;
    # Task 2 会把 body 换成消费 weather_agent.stream 的 async generator。
    return StreamingResponse(
        iter([]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
```

> 头部测试不读 body,空迭代器立即耗尽即可。Task 2 再换为真正的事件生成器。

- [ ] **Step 6: 跑测试，确认两条都 PASS**

Run: `uv run pytest tests/test_backend.py::test_stream_returns_event_stream_headers tests/test_backend.py::test_stream_empty_messages_returns_400 -v`
Expected: 两条都 PASS。

- [ ] **Step 7: 跑 lint/format，确认无新增警告**

Run: `uv run ruff format backend/main.py tests/test_backend.py`
Run: `uv run ruff check backend/main.py tests/test_backend.py`
Expected: `ruff format` 不报变更；`ruff check` 0 错误。

- [ ] **Step 8: 提交**

```bash
git add backend/main.py tests/test_backend.py
git commit -m "feat(backend): scaffold POST /api/chat/stream SSE endpoint"
```

---

## Task 2: 端到端 happy path（event_generator + SSE 解析 + 第三个测试）

**Files:**
- Modify: `backend/main.py`（替换占位生成器为真 `event_generator`，加 `_sse` 辅助）
- Modify: `tests/test_backend.py`（加 `_parse_sse_events` 辅助 + `test_stream_weather_emits_step_and_done`）

- [ ] **Step 1: 在 `tests/test_backend.py` 顶部加 `_parse_sse_events` 辅助**

先在文件顶部 import 区域追加（保持字母序）：

```python
import json
```

然后在 `test_chat_weather` 之前（即 `def test_chat_weather` 行的紧前方）插入：

```python
def _parse_sse_events(raw: str) -> list[dict[str, object]]:
    """把 SSE 文本流切成 [{event, id, data: dict}, ...]。"""
    events: list[dict[str, object]] = []
    current: dict[str, str] = {}
    for line in raw.splitlines():
        if line == "":
            if current:
                data_raw = current.pop("data", "{}") or "{}"
                events.append(
                    {
                        "event": current.pop("event", ""),
                        "id": current.pop("id", ""),
                        "data": json.loads(data_raw),
                    }
                )
                current = {}
            continue
        if line.startswith(":"):
            continue
        if ":" not in line:
            continue
        field, _, value = line.partition(":")
        current[field] = value.lstrip(" ")
    if current:
        data_raw = current.pop("data", "{}") or "{}"
        events.append(
            {
                "event": current.pop("event", ""),
                "id": current.pop("id", ""),
                "data": json.loads(data_raw),
            }
        )
    return events
```

- [ ] **Step 2: 在 `tests/test_backend.py` 末尾追加 happy-path 用例**

```python
def test_stream_weather_emits_step_and_done() -> None:
    """完整流应至少含 1 条 step 事件 + 末尾 done，且能拼出城市名。"""
    client = TestClient(app)
    with client.stream(
        "POST",
        "/api/chat/stream",
        json={
            "messages": [
                {"role": "user", "content": "What's the weather in San Francisco?"}
            ]
        },
    ) as response:
        assert response.status_code == 200
        lines = list(response.iter_lines(decode_unicode=True))

    raw = "\n".join(lines)
    events = _parse_sse_events(raw)

    steps = [e for e in events if e["event"] == "step"]
    assert len(steps) >= 1
    first_blocks = steps[0]["data"]["blocks"]
    assert any(b["type"] in {"tool_call", "text"} for b in first_blocks)

    assert events[-1]["event"] == "done"

    flat: list[object] = [b for s in steps for b in s["data"]["blocks"]]
    assert "San Francisco" in json.dumps(flat, ensure_ascii=False)
```

- [ ] **Step 3: 跑新测试，确认 FAIL（端点返回空 body，事件流解析为空）**

Run: `uv run pytest tests/test_backend.py::test_stream_weather_emits_step_and_done -v`
Expected: FAIL；最可能的原因是 `len(steps) >= 1` 失败（`steps == []`），或 `events[-1]` 抛 IndexError。

- [ ] **Step 4: 在 `backend/main.py` 中加 `_sse` 辅助函数**

在 `logger = logging.getLogger(__name__)` 行**之后**、`app = FastAPI(...)` 之前新增：

```python
def _sse(event: str, data: object, *, id: str | None = None) -> str:
    # SSE 单事件块:可选 id 行 + event 行 + data 行,行尾 \n,块间空行。
    parts: list[str] = []
    if id is not None:
        parts.append(f"id: {id}\n")
    parts.append(f"event: {event}\n")
    parts.append(f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n")
    return "".join(parts)
```

- [ ] **Step 5: 在 `backend/main.py` 中加入真正的 `event_generator`**

在 `logger = logging.getLogger(__name__)` 行**之后**、`app = FastAPI(...)` 之前新增（紧跟 `_sse` 辅助，逻辑相邻）：

```python
async def event_generator(request: ChatRequest) -> AsyncIterator[bytes]:
    # 流中异常类型不可控(LLM SDK / LangChain 内部),边界代码用 except Exception
    # 并强制 logging.exception 留痕,响应头已发出故不再 raise(详见 spec 错误处理段)。
    try:
        for chunk in weather_agent.stream(
            {"messages": [m.model_dump() for m in request.messages]},
            stream_mode="updates",
            version="v2",
        ):
            if chunk.get("type") != "updates":
                continue
            for step, data in chunk["data"].items():
                blocks = data["messages"][-1].content_blocks
                yield _sse(
                    "step",
                    {"step": step, "blocks": blocks},
                    id=uuid4().hex,
                ).encode("utf-8")
        yield _sse("done", {}).encode("utf-8")
    except Exception as exc:
        logger.exception("chat_stream agent raised")
        yield _sse("error", {"detail": str(exc)}).encode("utf-8")
```

- [ ] **Step 6: 改端点把空 body 替换为 `event_generator(request)`**

在 `@app.post("/api/chat/stream")` 端点里把 `iter([])` 替换为 `event_generator(request)`。完整端点变成：

```python
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 7: 跑后端全部测试，确认既有 4 + 新增 3 共 7 条全过**

Run: `uv run pytest tests/test_backend.py -v`
Expected: 7 passed。`test_chat_weather` 仍是真实 LLM 调用，需 `.env` 已配 `LONGCAT_*`；`test_stream_weather_emits_step_and_done` 同理。

- [ ] **Step 8: 跑格式化和类型检查**

Run: `uv run ruff format backend/main.py tests/test_backend.py`
Run: `uv run ruff check --fix backend/main.py tests/test_backend.py`
Run: `uv run mypy backend/main.py tests/test_backend.py`
Expected:
- `ruff format` 不报变更
- `ruff check` 0 错误
- `mypy` 0 错误（如果发现缺 import 或类型注解问题，参考"问题排查"段）

- [ ] **Step 9: 提交**

```bash
git add backend/main.py tests/test_backend.py
git commit -m "feat(backend): stream weather_agent steps as SSE on /api/chat/stream"
```

---

## Task 3: 同步 code_map.md

**Files:**
- Modify: `code_map.md` (L38 注释里加 `/api/chat/stream`)

- [ ] **Step 1: 更新 `code_map.md` 的 backend 注释**

把第 38 行：

```
│   ├── main.py                  # /health、/api/chat 路由
```

改为：

```
│   ├── main.py                  # /health、/api/chat、/api/chat/stream 路由
```

- [ ] **Step 2: 提交**

```bash
git add code_map.md
git commit -m "docs(code_map): note /api/chat/stream endpoint"
```

---

## Task 4: 端到端质量门 + 手动烟测

**Files:** 无（纯验证）

- [ ] **Step 1: 跑全仓 ruff format + check**

Run: `uv run ruff format .`
Run: `uv run ruff check .`
Expected: 0 错误。

- [ ] **Step 2: 跑 mypy**

Run: `uv run mypy .`
Expected: 0 错误。

- [ ] **Step 3: 跑全仓 pytest**

Run: `uv run pytest`
Expected: 全过（既有前端 Vitest 与后端 pytest 都过；后端重点关注 `tests/test_backend.py` 7 条全过）。

- [ ] **Step 4: 手动 curl 烟测（可选，但推荐）**

```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!
sleep 2
curl -N -X POST http://localhost:8000/api/chat/stream \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"What'"'"'s the weather in Tokyo?"}]}'
kill $SERVER_PID
```

Expected: 输出 ≥ 3 条 `event: step`（含 tool_call 与 text 两种 blocks）+ 1 条 `event: done`，每行 `data:` 后面是合法 JSON。

- [ ] **Step 5: 回归旧端点（确认未破坏）**

```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!
sleep 2
curl -X POST http://localhost:8000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"What'"'"'s the weather in Tokyo?"}]}'
kill $SERVER_PID
```

Expected: `{"reply":"...Tokyo..."}` 单行 JSON。

---

## 问题排查

- **`mypy` 报 `AsyncIterator` 找不到**：在 Python 3.13 下 `AsyncIterator` 在 `collections.abc`，确认 import 是 `from collections.abc import AsyncIterator`。
- **`mypy` 报 `_sse` 形参 `id` 与 builtin 冲突**：形参名 `id` 会与 builtin `id()` 重名但 mypy 通常不报；如报，改名为 `event_id` 并同步端点调用。
- **pytest 报 `RuntimeError: Form data requires "python-multipart"`**：与本任务无关，沿用既有 `test_backend.py` 用 `json=` 而非 `data=` 即可。
- **`test_stream_weather_emits_step_and_done` 间歇失败**：真实 LLM 调用偶有非确定返回（如模型跳过 tool call），保持 `blocks` 至少含 1 个 `type in {"tool_call","text"}` 即可，不要硬钉死 blocks 内容。
- **`curl -N` 看不到事件就断开**：反向代理或本地网络缓冲；本端点已设 `X-Accel-Buffering: no` + `Cache-Control: no-store`，`curl -N` 关闭 curl 自带缓冲。

---

## 完成后自检

- [ ] 7 个后端测试全过
- [ ] `code_map.md` 注释已更新
- [ ] 旧 `POST /api/chat` 行为不变（手工或既有 `test_chat_weather` 覆盖）
- [ ] 4 个 commit 在 main 上按序：`scaffold` → `stream weather_agent steps` → `code_map` → 验证
