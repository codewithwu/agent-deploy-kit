# /api/chat/stream 流式端点 设计

- 日期：2026-06-13
- 范围：在 `agent-deploy-kit` 后端新增一个 SSE 流式端点 `POST /api/chat/stream`，把 `weather_agent.stream(stream_mode='updates', version='v2')` 的 step 增量以 Server-Sent Events 形式转发给 HTTP 客户端。**仅后端**，前端与 `weather_agent` 本体不在本次范围。

## 背景与目标

仓库当前 `backend/main.py` 只有非流式 `POST /api/chat`（一次 `weather_agent.invoke()`，等全部跑完再返回完整 reply）。但 `jupyter/weather-agent.ipynb` 已经验证 `weather_agent.stream(stream_mode='updates', version='v2')` 能按 step 给出 `model`/`tools`/`model` 三段增量（其中包含 `tool_call` 块与 `text` 块），更适合驱动"逐步展示"的聊天体验。

本任务把这条流式链路暴露为 HTTP 接口，**不**改造前端、**不**改 `weather_agent`、**不**引入鉴权/通用 agent 路由。

设计原则：
- 简洁优先（`Simplicity First`）：单文件后端增量 + 单端点，**不开新模块**。
- 复用既有 schema：请求体仍是 `ChatRequest`，不新增 Pydantic 模型。
- 与 jupyter 输出 1:1 对齐：直接转发 `data["messages"][-1].content_blocks`，不在后端做 envelope 翻译。
- 保留旧端点：`POST /api/chat` 继续可用，前端/其他调用方无需改动。
- 质量门：ruff format / ruff check / mypy / pytest 全过。

## 端点契约

### `POST /api/chat/stream`（新增）

- **请求体**：复用 `ChatRequest`，形状与 `POST /api/chat` 完全一致：
  ```json
  {
    "messages": [
      {"role": "user", "content": "What's the weather in San Francisco?"}
    ]
  }
  ```
- **输入校验**：`messages` 为空 → `400 {"detail": "messages must not be empty"}`（**不**进入流，与旧端点对称）。
- **成功响应**：HTTP 200，响应头：
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-store`
  - `X-Accel-Buffering: no`（避免反向代理缓冲）
- **SSE 事件**（三种）：
  1. `event: step` — 每个 LangChain step 推一条
     - `id`: `uuid4().hex`
     - `data`: `{"step": "<model|tools|...>", "blocks": [...content_blocks 原样...]}`，`json.dumps(..., ensure_ascii=False, default=str)` 兜底
  2. `event: done` — 流正常结束时推一条
     - `data`: `{}`
  3. `event: error` — 流中异常时推一条（异常 **不** 再 raise，HTTP 状态保持 200，因为响应头已发出）
     - `data`: `{"detail": "<异常信息>"}`
- **消息顺序**：N 条 `step` → 1 条 `done`；异常路径下 N 条 `step` → 1 条 `error`（无 `done`）。

### `POST /api/chat`（保留，不变）

非流式端点行为、契约、错误码均不变，本任务不动。

### `GET /health`（保留，不变）

存活探针不动。

## 组件

### `backend/main.py`（就地修改）

新增两个符号：

- **辅助函数 `_sse(event: str, data: object, *, id: str | None = None) -> str`**
  - 拼出标准 SSE 文本块：`id: <id>\nevent: <event>\ndata: <json>\n\n`。
  - `id` 为空时省略 `id:` 行。
  - `json.dumps` 用 `ensure_ascii=False, default=str`，避免非 ASCII 文本被转义、非 JSON 原生类型（如 LangChain 内部对象）抛错。

- **异步生成器 `event_generator(request: ChatRequest) -> AsyncIterator[bytes]`**
  1. `try` 块：遍历 `weather_agent.stream({"messages": [m.model_dump() for m in request.messages]}, stream_mode='updates', version='v2')`：
     - 仅处理 `chunk["type"] == "updates"]`。
     - 对每个 `(step, data)`：取 `data["messages"][-1].content_blocks`，`yield _sse("step", {"step": step, "blocks": blocks}, id=uuid4().hex).encode("utf-8")`。
  2. 流正常结束 → `yield _sse("done", {}).encode("utf-8")`。
  3. `except Exception as exc`：`logging.exception(...)` 记录，`yield _sse("error", {"detail": str(exc)}).encode("utf-8")`，**不再 raise**。

- **端点 `chat_stream`**
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
  - 校验在生成器**外**做，保持与旧端点一致的 400 JSON 响应。
  - `event_generator` 内部 `except Exception` 是边界代码（响应头已发出、LLM SDK 异常类型不可控），捕获根类并强制 `logging.exception` 留痕；这与 `python.md` 中"具体异常类型"的通用规则有妥协，注释里说明该选择。

新增 `from collections.abc import AsyncIterator`、`from uuid import uuid4`、`import json`、`import logging`、`from fastapi.responses import StreamingResponse` 等顶层 import（按 ruff isort 自动排序）。

### `tests/test_backend.py`（就地追加 3 个用例 + 1 个辅助）

风格沿用现有文件：FastAPI `TestClient`、**不 mock LLM**、直接打真实 agent。`.env` 中需已配置 `LONGCAT_*`（与 `test_chat_weather` 一致）。

- **辅助 `_parse_sse_events(raw: str) -> list[dict[str, object]]`**
  - 按空行切分 SSE 文本块；每块解析 `event:` / `id:` / `data:` 三种行，`data` 用 `json.loads` 反序列化。
  - 行内多余空白剥除；缺字段容错（如无 `id`）。

- **用例 1 `test_stream_returns_event_stream_headers`**
  - `POST /api/chat/stream` 用 `client.stream(...)` 上下文管理器进入。
  - 断言响应头 `content-type` 以 `text/event-stream` 开头、`cache-control == "no-store"`。
  - 不消费 body，只验证头。

- **用例 2 `test_stream_weather_emits_step_and_done`**
  - `client.stream("POST", "/api/chat/stream", json={"messages":[{"role":"user","content":"What's the weather in San Francisco?"}]}) as r:` 遍历 `r.iter_lines(decode_unicode=True)`。
  - 拼成字符串过 `_parse_sse_events`。
  - 断言：
    - 至少 1 条 `event == "step"`，第一条 `data["blocks"]` 至少含 1 个 `{"type": in {"tool_call","text"}}` 元素。
    - 事件流中**最后**一条 `event == "done"`。
    - 把所有 `step` 事件的 `blocks` 拍平后 `json.dumps` 一次，断言 `"San Francisco"` 出现在其中（与 `test_chat_weather` 一致地验证业务正确性）。

- **用例 3 `test_stream_empty_messages_returns_400`**
  - `POST /api/chat/stream` 带 `{"messages": []}` → 断言 400 + `detail == "messages must not be empty"`（与现有 `test_chat_empty_messages_returns_400` 对称）。

## 数据流

```
HTTP POST /api/chat/stream
  └─ FastAPI 校验 ChatRequest（messages 非空 → 否则 400 JSON）
       └─ StreamingResponse(event_generator(request), media_type="text/event-stream")
            └─ event_generator:
                 └─ for chunk in weather_agent.stream({...}, stream_mode='updates', version='v2'):
                      └─ for step, data in chunk["data"].items():
                           blocks = data["messages"][-1].content_blocks
                           yield SSE("step", {"step": step, "blocks": blocks})
                 └─ yield SSE("done", {})
                 └─ except Exception: logging.exception; yield SSE("error", {"detail": str(exc)})
```

正常路径事件序列（与 jupyter 三步输出一致）：

```
event: step
data: {"step": "model", "blocks": [{"type": "tool_call", "name": "get_weather", "args": {"city": "San Francisco"}, "id": "call_..."}]}

event: step
data: {"step": "tools", "blocks": [{"type": "text", "text": "It's always sunny in San Francisco!"}]}

event: step
data: {"step": "model", "blocks": [{"type": "text", "text": "It's always sunny in San Francisco!"}]}

event: done
data: {}

```

错误路径（响应头已发出，HTTP 保持 200）：

```
event: step
data: {...前序 step...}

event: error
data: {"detail": "<异常信息>"}

```

## 错误处理

- **空消息列表**：在生成器外判断并 `HTTPException(400)`，客户端收到标准 JSON 错误响应。
- **Pydantic 字段缺失**（如 `role` / `content` 缺）：FastAPI 默认 422 + 结构化 detail。
- **流中 agent / LLM 异常**：捕获根类 + `logging.exception` + 推送 `event: error` + 关闭流；**不**再 raise（raise 会被 Starlette 捕获并以 500 关闭，但此时 chunked body 已经开始，前端会看到半截流，体验更差）。这是边界代码对 `python.md` "具体异常类型"规则的显式妥协，代码注释里说明。
- **客户端中途断连**：不专门处理；Starlette 检测到断开后会停止迭代生成器，LangChain sync generator 随请求清理（无后台线程被悬挂）。

## 配置与运行

- 启动（开发期，与旧端点共用 uvicorn）：
  ```bash
  uv run uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
  ```
- 手动验证（curl）：
  ```bash
  curl -N -X POST http://localhost:8000/api/chat/stream \
    -H 'content-type: application/json' \
    -d '{"messages":[{"role":"user","content":"What'"'"'s the weather in Tokyo?"}]}'
  # 期望：3 条 event: step + 1 条 event: done
  ```

## 验证标准

1. `uv run ruff format .` 无变更。
2. `uv run ruff check --fix .` 全过。
3. `uv run mypy .` 全过。
4. `uv run pytest tests/test_backend.py` 全部用例（既有 4 + 新增 3）通过。
5. 启动 uvicorn 后 `curl -N` `/api/chat/stream` 看到至少 1 条 `event: step` 与末尾 1 条 `event: done`。
6. 旧 `POST /api/chat` 行为不变（既有 `test_chat_weather` 等用例持续通过）。

## 范围外（明确不做）

- 前端 `useChat` / `postChat` 切到流式消费（独立任务）。
- token 级流（`stream_mode='messages'`）与"打字机"效果。
- 流中异常的 `error` 事件单测（需 mock agent，引入新模式，本轮不引入）。
- 通用 agent 路由（`/agents/{name}/stream`）——本任务只暴露 weather_agent。
- 修改 `weather_agent` 本体、`utils/`、`pyproject.toml` 打包范围。
- 鉴权 / 速率限制 / 会话存储。

## 后续可考虑

- 引入 token 级流（`stream_mode='messages'`）支持打字机效果。
- 前端用 `fetch` + `ReadableStream` 消费 SSE，按 `blocks[0].type` 渲染 tool_call / text 增量。
- 通用 agent 注册路由，自动扫描 `agents/*/agent.py` 暴露 `/agents/{name}/stream`。
