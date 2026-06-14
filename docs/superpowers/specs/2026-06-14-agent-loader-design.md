# 后端 Agent 动态加载 设计

- 日期：2026-06-14
- 范围：新增 `backend/agent_loader.py`，让后端按环境变量从 `agents/` 动态加载智能体实例；修改 `backend/main.py` 接入。**不改任何具体智能体**。

## 背景与目标

当前 `backend/main.py` 硬编码 `from agents.weather_agent import weather_agent`，`agents/__init__.py` 也硬编码 `__all__ = ["weather_agent"]`。新增或切换智能体需要改两处源码，与"零配置部署"的脚手架定位不一致。

目标：
- 提供 `get_agent()` 单入口，按环境变量 `AGENT_NAME` 加载 `agents/<name>_agent/agent.py` 中导出的同名实例。
- 启动期（`main.py` 模块导入时）完成校验，配置错就在 uvicorn 启动阶段失败，**不**延后到首个请求。
- 改动面最小：只动 `backend/` 两侧文件，不动 `agents/` 下任何子包。

设计原则：
- 单一职责：`agent_loader.py` 只管加载，不持有请求级状态。
- 缓存只一份：模块级 `lru_cache(maxsize=1)`，同时支持测试时 `cache_clear()` 重置。
- 不引入 per-request 切换、配置文件、CLI 等当前用不到的能力（YAGNI）。

## 目录与文件

```
backend/
├── agent_loader.py           # 新增
└── main.py                   # 修改：替换 import、加 agent = get_agent()、替换调用点

tests/
├── conftest.py               # 新增：默认 AGENT_NAME=weather_agent
└── test_agent_loader.py      # 新增：loader 单元测试

agents/
└── __init__.py               # 不动（loader 不依赖其聚合）
```

不动：`agents/<name>_agent/` 全部内容、`backend/schemas.py`、现有 `tests/test_backend.py`。

## 组件

### `backend/agent_loader.py`（新增）

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

要点：
- **无参数 API**：`get_agent()` 自身不接受参数；`AGENT_NAME` 在启动期就是稳定的。
- **三层校验**：
  1. 环境变量缺失 → 清晰 `RuntimeError`（比 `os.environ[...]` 的 `KeyError` 友好）。
  2. 模块路径不存在 → `importlib` 抛 `ModuleNotFoundError`，自然透传。
  3. 模块里没那个属性 → 自定义 `RuntimeError` 提示「`agents.<name>.agent` 不导出 `<name>`，检查子包命名约定」。
- **类型注解**：返回 `object`。LangChain `CompiledGraph` 真实类型在本设计中**不**作为返回签名——避免在 `agent_loader.py` 里引入对 `langchain` 内部模块路径的耦合，调用方（`main.py`）仍按 duck-typing 使用 `.invoke` / `.stream`。`mypy` 在 `CompiledGraph` 不被强依赖的前提下，`object` 即可。
- **绝对导入**：`import importlib`、`import os`，无相对导入。
- **中文 docstring** 顶部一行，无无效注释。

### `backend/main.py` 修改

```python
# 顶部 import
-from agents.weather_agent import weather_agent
+from backend.agent_loader import get_agent
 from backend.schemas import ChatRequest, ChatResponse, HealthResponse

 logger = logging.getLogger(__name__)

+agent = get_agent()  # 启动期主动加载；env/模块错误在此抛出
+

 def _sse(event: str, data: object, *, id: str | None = None) -> str:
     ...

 async def event_generator(request: ChatRequest) -> AsyncIterator[bytes]:
     try:
-        for chunk in weather_agent.stream(
+        for chunk in agent.stream(
             {"messages": [m.model_dump() for m in request.messages]},
             stream_mode="updates",
             version="v2",
         ):
             ...

 @app.post("/api/chat", response_model=ChatResponse)
 async def chat(request: ChatRequest) -> ChatResponse:
     if not request.messages:
         raise HTTPException(status_code=400, detail="messages must not be empty")
     try:
-        result = weather_agent.invoke(
+        result = agent.invoke(
             {"messages": [m.model_dump() for m in request.messages]}
         )
     ...
```

要点：
- 全文 `weather_agent.X` → `agent.X`（共 2 个调用点：`stream` 和 `invoke`）。
- `agent = get_agent()` 放在 `logger` 之后、`_sse` 之前；模块级单例，FastAPI handler 闭包直接捕获。
- 现有 `try/except Exception` 行为不变；启动失败由 uvicorn 进程退出承接。

### 不动的文件

- `agents/__init__.py`：硬编码 `from agents import weather_agent` / `__all__ = ["weather_agent"]` 在新路径上不参与（loader 直接 `importlib.import_module("agents.<name>.agent")`），按 surgical changes 原则保留原样。
- `agents/weather_agent/` 全部内容：与 loader 解耦，零改动。
- `backend/schemas.py`：无关联。

## 数据流

```
uvicorn 启动
  └─ import backend.main
       └─ import backend.agent_loader          # 定义 get_agent，未触发加载
       └─ module body: agent = get_agent()      # ← fail-fast 点
            ├─ os.environ.get("AGENT_NAME")     # 缺失 → RuntimeError，进程退出
            ├─ importlib.import_module(...)     # 缺失 → ModuleNotFoundError，进程退出
            └─ getattr(module, name)            # 缺失 → RuntimeError，进程退出
       └─ app = FastAPI(...)                    # 启动成功则继续

请求 /api/chat 或 /api/chat/stream
  └─ handler 闭包捕获模块级 `agent`，直接 .invoke / .stream
```

## 错误处理

| 场景 | 触发时机 | 抛错类型 | 表现 |
|------|----------|----------|------|
| `AGENT_NAME` 未设 | 启动时 `agent = get_agent()` | `RuntimeError` | uvicorn 退出 |
| `AGENT_NAME=foo` 但 `agents/foo_agent/` 不存在 | 启动时 | `ModuleNotFoundError` | uvicorn 退出 |
| `agents/foo_agent/agent.py` 没定义 `foo` 实例 | 启动时 | `RuntimeError` | uvicorn 退出 |
| 请求期 LLM/工具异常 | 首次 / 每次请求 | `Exception`（main.py 既有 try/except） | 500 / SSE error 事件 |

## 验证标准

1. `uv run ruff format .` 无变更（或仅 `agent_loader.py` 新文件）。
2. `uv run ruff check --fix .` 全过。
3. `uv run mypy .` 全过（`agent_loader.py` 中所有函数带类型注解、`__all__` 显式声明）。
4. `uv run pytest` 全部测试通过，包含：
   - 现有 `tests/test_backend.py`（依赖 `AGENT_NAME=weather_agent`，详见下文）。
   - 新增 `tests/test_agent_loader.py`：
     - `test_missing_env_raises_runtime_error`：删 `AGENT_NAME` → `RuntimeError`。
     - `test_loads_weather_agent`：设 `AGENT_NAME=weather_agent` → 返回非 None。
     - `test_caches_result`：两次调用 `is` 相等。
     - `test_unknown_name_raises`：设 `AGENT_NAME=no_such_agent_xyz` → `ModuleNotFoundError`。
5. 手工烟测：`AGENT_NAME=weather_agent uv run uvicorn backend.main:app` → POST `/api/chat` 旧金山天气，返回 200 且 `reply` 含 "San Francisco"。

### 关于 `tests/conftest.py`

`test_backend.py` 中 `test_chat_weather` / `test_stream_weather_emits_step_and_done` 等用例隐式依赖 `AGENT_NAME=weather_agent`。**新增** `tests/conftest.py`：

```python
"""测试套件全局 fixture。"""

import os

os.environ.setdefault("AGENT_NAME", "weather_agent")
```

放在文件顶层 import 期执行，确保 `from backend.main import app` 时 `get_agent()` 拿到默认 agent。**前提**：`pytest` 的 rootdir 必须能自动收集 conftest（本项目 `pyproject.toml` 未自定义 `testpaths`，默认行为即可）。

## 范围外（明确不做）

- 不引入 per-request 切换（`/api/{agent_name}/chat` 路径）、配置文件、CLI 工具。
- 不修改 `agents/__init__.py` 的硬编码 `weather_agent`（loader 路径不依赖它）。
- 不为「`agents.<name>.agent` 缺属性」分支写测试（写起来比它防的 bug 价值大，YAGNI）。
- 不重写 `agents/weather_agent/` 任何文件。
- 不引入新依赖（`importlib`、`os`、`functools` 全部标准库）。

## 后续可考虑

- `agents/__init__.py` 是否清理为不再硬编码 `weather_agent`（与 loader 实际行为对齐，但属独立改动）。
- `tests/conftest.py` 是否升级为 fixture 而非模块级 `os.environ.setdefault`（引入 fixture 后参数化更灵活，但当前不需要）。
- 是否暴露 `list_agents()` 给 `/health` 端点，便于运维排障（当前未提，保持 API 极简）。
