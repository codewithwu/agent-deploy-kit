# Weather Agent FastAPI 后端 设计

- 日期：2026-06-12
- 范围：在 `agent-deploy-kit` 仓库新增一个最小可运行的 FastAPI 后端，将 `agents/weather_agent/agent.py` 中的 `weather_agent` 暴露为 HTTP 接口。

## 背景与目标

仓库目前已有一个 `weather_agent`（基于 `langchain.agents.create_agent`，含 `get_weather` 工具）与配套的 `jupyter/weather-agent.ipynb` 交互式实验，但还没有 Web 接口。本任务要把这个智能体包装成一个可被前端（或任何 HTTP 客户端）调用的 API，作为脚手架的首个端到端示例。

设计原则：
- 简洁优先（`Simplicity First`）：单文件后端、单一专用端点、仅返回最终回答文本。
- 不改 `weather_agent` 本体：后端只做导入与包装，不修改智能体逻辑。
- 不改 `pyproject.toml` 的 setuptools 打包范围（仅 `agents*`），本任务不涉及生产打包。
- 质量门：ruff format / ruff check / mypy / pytest 全过。

## 目录与文件

新增以下文件，**不改动** 已有结构：

```
agent-deploy-kit/
├── backend/                    # 新增
│   ├── __init__.py             # 空包，__all__: list[str] = []
│   └── main.py                 # FastAPI app + 两个端点
├── tests/                      # 新增（当前仓库无此目录）
│   ├── __init__.py
│   └── test_backend.py         # TestClient 烟测 /health 与 /api/chat
└── docs/superpowers/specs/
    └── 2026-06-12-weather-agent-backend-design.md   # 本文件
```

> 说明：当前 `pyproject.toml` 的 setuptools 仅 `include = ["agents*"]`，`utils` 与 `backend` 都未被打包。本任务范围是开发期可用（`uv run uvicorn backend.main:app`），打包问题不在本次范围内。

## 端点契约

### `POST /api/chat`

- **请求体**（Pydantic 校验）：
  ```json
  {
    "messages": [
      {"role": "user", "content": "What's the weather in San Francisco?"}
    ]
  }
  ```
  - `messages` 至少 1 条；为空时返回 400。
- **成功响应**（200）：
  ```json
  {
    "reply": "It's always sunny in San Francisco!"
  }
  ```
  - `reply` 是 `weather_agent` 返回的最后一条消息的 `content`（即最终 AIMessage 的回答）。
- **错误**：
  - 400：`{"detail": "messages must not be empty"}`
  - 500：`{"detail": "<异常信息>"}`（`weather_agent.invoke` 抛任何异常时）

### `GET /health`

- **成功响应**（200）：`{"status": "ok"}`
- 用于存活探针，方便后续接入 Docker / k8s。

## 组件

### `backend/main.py`

- 顶层导入 `weather_agent`（其内部 LLM 客户端已通过 `get_singleton_client` 用 `lru_cache` 缓存单例），避免每个请求重新构造图。
- 注册 `CORSMiddleware`：`allow_origins=["*"]`、`allow_methods=["*"]`、`allow_headers=["*"]`、`allow_credentials=True`。
- Pydantic 模型：
  - `ChatMessage(role: str, content: str)`
  - `ChatRequest(messages: list[ChatMessage])`（**不**用 `min_length`，空消息由端点显式判断并返回 400，避免 Pydantic 422 与自定义 400 行为分裂）。
  - `ChatResponse(reply: str)`
  - `HealthResponse(status: str)`
- 端点逻辑：
  1. 接收 `ChatRequest`。
  2. 显式判断 `not request.messages` → 抛 `HTTPException(400, "messages must not be empty")`。
  3. 用 `m.model_dump()` 把 Pydantic 转成 dict 列表，传入 `weather_agent.invoke({"messages": ...})`。
  4. 取 `result["messages"][-1].content`，空字符串兜底。
  5. 包成 `ChatResponse` 返回。
  6. `try/except Exception` 包住 `invoke`，转 `HTTPException(500, detail=str(exc))`。

### `tests/test_backend.py`

- 使用 `fastapi.testclient.TestClient` 加载 `backend.main:app`。
- 测试 1（`test_health`）：GET `/health` → 200 + `{"status": "ok"}`。
- 测试 2（`test_chat_weather`）：POST `/api/chat`，消息 "What's the weather in San Francisco?" → 200 + `reply` 字段存在且包含 "San Francisco"。
- **不 mock LLM**：`.env` 中需已配置 `LONGCAT_API_KEY` / `LONGCAT_BASEURL` / `LONGCAT_MODEL_NAME`（`agent.py` 用 `llm_provider="longcat"`）。pytest 跑通即证明 LLM 联接、工具调用、最终回答提取与 HTTP 包装整条链路通。

## 数据流

```
HTTP POST /api/chat
  └─ FastAPI 校验 ChatRequest（messages 非空）
       └─ weather_agent.invoke({"messages": [dict, ...]})
            └─ LLM 决策 → 调用 get_weather(city)
                 └─ ToolMessage 回流 → 最终 AIMessage
       └─ 提取 result["messages"][-1].content → reply
            └─ HTTP 200 {"reply": "..."}
```

错误路径：

```
weather_agent.invoke 抛异常
  └─ except Exception → HTTPException(500, detail=str(exc))
       └─ HTTP 500 {"detail": "..."}
```

## 错误处理

- **空消息列表**：端点显式判断并返回 400 + `{"detail": "messages must not be empty"}`。
- **Pydantic 字段缺失**（如 `role` / `content` 缺）：FastAPI 默认 422 + 结构化 detail。
- **LLM / 工具异常**：包成 500 + `detail`，不向客户端泄露堆栈。
- **返回 messages 为空**（agent 异常退出）：返回 500 `agent returned no messages`。

不引入全局异常处理器；脚手架阶段 `HTTPException` 已够用。

## 配置与运行

- `.env` 由 `utils/langchain_model/llm_factory.py:12` 的 `load_dotenv()` 自动加载，无需后端额外处理。
- 启动（开发期）：
  ```bash
  uv run uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
  ```
- 手动验证：
  ```bash
  curl -X POST http://localhost:8000/api/chat \
    -H 'content-type: application/json' \
    -d '{"messages":[{"role":"user","content":"What'"'"'s the weather in Tokyo?"}]}'
  # 期望：{"reply": "...Tokyo..."}
  ```

## 验证标准

1. `uv run ruff format .` 无变更。
2. `uv run ruff check --fix .` 全过。
3. `uv run mypy .` 全过。
4. `uv run pytest tests/test_backend.py` 两个测试全过。
5. 启动 uvicorn 后 `curl` `/api/chat` 返回含城市名的 reply。

## 范围外（明确不做）

- 多轮对话 / thread_id / checkpoint（单轮 stateless 足够脚手架首个示例）。
- 流式（SSE）输出。
- 鉴权 / 速率限制（脚手架阶段不引入）。
- 通用 agent 注册路由（`/agents/{name}/invoke`）——本任务只暴露 weather_agent。
- 修改 `pyproject.toml` 的 setuptools 打包范围。
- 修改 `weather_agent` 本体或 `utils/`。
- 更新 `code_map.md`（可在后续"新增 backend"任务中一起更新；本任务聚焦最小闭环）。

## 后续可考虑

- 加 `/agents` 列表 + `/agents/{name}/invoke` 通用端点，自动扫描 `agents/*/agent.py`。
- 引入 SSE 流式输出。
- 引入会话存储（SQLite/Redis）支持多轮。
- 打包到 Docker 镜像（届时再处理 `pyproject.toml` 的 `utils` / `backend` 打包范围）。
