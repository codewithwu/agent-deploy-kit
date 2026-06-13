# Code Map · 代码仓库索引

> 用途：记录仓库的目录结构、文件职责与关键导出，便于修改代码时快速定位。
> 维护：新增 / 删除 / 重命名文件时同步更新本文件。

## 项目概览

Agent Deploy Kit —— LangChain 智能体零配置部署为 Web 应用的脚手架。
开发者专注智能体逻辑，框架负责封装 FastAPI 接口与 React 前端。

- **Python**：3.13+（见 `.python-version`）
- **包管理**：`uv`（清华源，项目禁用 `pip`）
- **后端栈**：FastAPI + LangChain（`pyproject.toml` 含 `langchain` / `langchain-openai` / `langchain-ollama` / `langchain-nvidia-ai-endpoints` / `fastapi` / `uvicorn`）
- **前端栈**：Vite 5 + React 18 + TypeScript 5（Tailwind 3 + shadcn/ui，详见 `frontend/package.json`）
- **测试**：pytest（后端，烟测 `tests/test_backend.py`）/ Vitest + @testing-library/react（前端）
- **质量门**：ruff / mypy（后端），ESLint + `tsc --noEmit`（前端）
- **打包入口**：`agents/`（`pyproject.toml` 中 setuptools 仅 include `agents*`）
- **当前状态**：最小端到端样例已可跑通——`weather_agent` 智能体 + FastAPI `/api/chat` 接口 + React 聊天界面 + pytest/Vitest 烟测

## 目录树

```
agent-deploy-kit/
├── .claude/
│   ├── rules/
│   │   ├── behavioral.md        # 行为准则（思考、简洁、外科手术式修改、目标驱动）
│   │   ├── python.md            # Python 编码规范（中文注释、100% 类型注解、绝对导入）
│   │   ├── tooling.md           # uv / ruff / mypy / pytest / jupyter 命令速查
│   │   └── claude-md-style.md   # CLAUDE.md 编写与维护规范
│   └── settings.local.json      # 本地权限白/黑名单（git 共享）
├── agents/                      # 智能体实现（项目打包入口）
│   ├── __init__.py
│   └── weather_agent/
│       ├── __init__.py
│       └── agent.py             # create_agent 示例
├── backend/                     # FastAPI 后端
│   ├── __init__.py
│   ├── main.py                  # /health、/api/chat、/api/chat/stream 路由
│   └── schemas.py               # Pydantic 请求/响应模型
├── frontend/                    # Vite + React + TS 前端
│   ├── .env.example             # VITE_API_BASE 示例
│   ├── .env.local               # 本地环境变量（**不入 git**）
│   ├── .gitignore               # 前端独立 ignore
│   ├── README.md                # 前端开发与脚本说明
│   ├── components.json          # shadcn/ui 配置
│   ├── package.json             # 依赖与脚本（pnpm）
│   ├── pnpm-lock.yaml
│   ├── pnpm-workspace.yaml
│   ├── eslint.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json / tsconfig.node.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── index.html
│   ├── dist/                    # 生产构建产物（git 忽略）
│   ├── node_modules/            # 依赖（git 忽略）
│   └── src/
│       ├── main.tsx / App.tsx / index.css / types.ts
│       ├── components/          # Sidebar / ChatWindow / MessageList / MessageBubble / ChatInput / EmptyState
│       │   └── ui/              # shadcn/ui 原子组件（button / dropdown-menu / scroll-area / sheet / sonner / textarea）
│       ├── context/             # ChatContext
│       ├── hooks/               # useChat / useConversations
│       ├── lib/                 # api / storage / utils
│       └── test/                # Vitest setup + sanity test
├── utils/                       # 通用工具
│   ├── __init__.py
│   └── langchain_model/         # LangChain LLM 客户端工厂
│       ├── __init__.py
│       ├── base.py              # lru_cache 单例
│       └── llm_factory.py       # 多提供商客户端
├── tests/                       # 后端烟测（pytest）
│   ├── __init__.py
│   └── test_backend.py          # /health、/api/chat、CORS 烟测
├── docs/
│   └── superpowers/
│       ├── specs/               # 设计规格（按日期命名）
│       │   ├── 2026-06-12-react-frontend-chat-design.md
│       │   └── 2026-06-12-weather-agent-backend-design.md
│       └── plans/               # 实施计划（按日期命名）
│           ├── 2026-06-12-react-frontend-chat.md
│           └── 2026-06-12-weather-agent-backend.md
├── jupyter/
│   └── weather-agent.ipynb      # 智能体交互式实验
├── myproject.egg-info/          # `uv build` 产物（已由 `.gitignore` 中 `*.egg-info/` 忽略）
├── .env                         # 本地环境变量（**不入 git**，含 API Key）
├── .gitignore                   # Git 忽略规则（含 `cython_debug/`、`uv.md`、`plan/`、`*.egg-info/` 等）
├── .python-version              # Python 版本声明（3.13）
├── pyproject.toml               # 项目元数据 / 依赖 / setuptools 配置
├── uv.lock                      # 锁定依赖
├── LICENSE                      # 许可证
├── README.md                    # 项目说明（启动前后端的命令）
├── CHANGELOG.md                 # 变更日志（**当前为空**）
├── CLAUDE.md                    # Claude 项目指令（引用 `.claude/rules/*`）
└── code_map.md                  # 本文件
```

> 根目录有可疑文件 `=1.2.2`（0 字节，疑似 `uv add` 误操作残留），未在 `.gitignore` 中忽略，但 `git status` 未跟踪，可在确认无影响后删除。

## 文件索引

### 根目录配置

| 文件 | 用途 | 修改时机 |
|---|---|---|
| `pyproject.toml` | 项目元数据、依赖声明、setuptools 打包配置（仅打包 `agents*`，排除 `jupyter*` 与 `tests*`） | 增/改依赖、改 Python 版本、调整打包范围 |
| `uv.lock` | 锁定依赖版本 | `uv sync` / `uv add` 后自动更新，**勿手动改** |
| `.python-version` | 声明 Python 版本 | 升级/降级 Python 时 |
| `.gitignore` | Git 忽略规则 | 新增需忽略的目录或文件类型 |
| `.env` | 本地环境变量（含各 LLM 提供商 API Key） | 新增/轮换 API Key、调换本地 LLM 地址 |
| `CLAUDE.md` | Claude 项目指令（行为/Python/工具规范入口） | 项目工作流或规范变更 |
| `README.md` | 项目对外说明（含前后端启动命令） | 对外宣传语、徽章、用法变更 |
| `CHANGELOG.md` | 变更日志 | 每次发版记录 |
| `LICENSE` | 许可证 | **通常不动** |
| `code_map.md` | 本索引 | 文件结构变更时 |

### `.claude/`

| 文件 | 用途 | 修改时机 |
|---|---|---|
| `rules/behavioral.md` | 编码行为准则（思考优先、简洁、外科手术式修改、目标驱动） | 团队行为规范变更 |
| `rules/python.md` | Python 编码规范（中文注释、类型注解、绝对导入、`__all__` 等） | 编码风格调整 |
| `rules/tooling.md` | uv / ruff / mypy / pytest / jupyter 命令速查 | 工具链或命令变更 |
| `rules/claude-md-style.md` | CLAUDE.md 自身的编写与维护规范 | 文档元规范变更 |
| `settings.local.json` | 本地权限白/黑名单 | 新增常用命令授权、收紧危险操作 |

### `agents/` —— 智能体实现

> 唯一被打包的包。新增智能体：建子目录 + 写 `agent.py` + 在 `agents/__init__.py` 添加导出。

| 文件 | 关键导出 / 内容 | 何时修改 |
|---|---|---|
| `agents/__init__.py` | 导出 `weather_agent` | 新增顶层智能体模块时 |
| `agents/weather_agent/__init__.py` | 导出 `get_weather`、`weather_agent` | 调整对外 API |
| `agents/weather_agent/agent.py` | `get_weather(city)`（占位实现）、`weather_agent = create_agent(...)`（provider=`longcat`） | 替换真实天气工具、改 provider、调整 system_prompt |

### `utils/` —— 通用工具

| 文件 | 关键导出 / 内容 | 何时修改 |
|---|---|---|
| `utils/__init__.py` | 空包（`__all__: list[str] = []`） | 新增 utils 子包时 |
| `utils/langchain_model/__init__.py` | 导出 `LLMFactory`、`get_singleton_client` | 调整对外 API |
| `utils/langchain_model/base.py` | `get_singleton_client(llm_provider)`（`@lru_cache` 单例） | 调整默认 provider、改缓存策略 |
| `utils/langchain_model/llm_factory.py` | `LLMFactory` 类 + 模块级 `rate_limiter`；支持 `ollama` / `nvidia` / `zhipu` / `bailing` / `siliconflow` / `modelscope` / `longcat` / `deepseek` | 新增 provider、调整限流参数、增/改构造选项 |

#### LLM 提供商环境变量约定

`_OPENAI_PROVIDERS` 中每个 key 对应一组环境变量：`<PREFIX>_API_KEY` / `<PREFIX>_BASEURL` / `<PREFIX>_MODEL_NAME`（PREFIX 见 `llm_factory.py:18`）。
`ollama` 与 `nvidia` 使用各自的固定变量名。

### `jupyter/`

| 文件 | 用途 | 何时修改 |
|---|---|---|
| `weather-agent.ipynb` | 天气智能体交互式实验笔记 | 增/改调试与实验记录 |

### `backend/` —— FastAPI 后端

> 把 `agents/weather_agent` 暴露为 HTTP 接口。`pyproject.toml` 的 setuptools **未**把此包纳入发布范围（仅 `agents*`）。

| 文件 | 关键导出 / 内容 | 何时修改 |
|---|---|---|
| `backend/__init__.py` | 空包（`__all__: list[str] = []`） | 新增 backend 子模块时 |
| `backend/main.py` | `app = FastAPI(...)`；`/health`（GET）、`/api/chat`（POST，body=`{messages: [{role, content}, ...]}`）；CORS 全开（开发期） | 新增端点、调整异常处理 |
| `backend/schemas.py` | `HealthResponse` / `ChatMessage` / `ChatRequest` / `ChatResponse` | 增/改请求/响应模型 |

### `frontend/` —— React 前端

> Vite + React 18 + TypeScript 5 + Tailwind 3 + shadcn/ui。包管理 `pnpm`，自带独立 `.gitignore` 与 `.env.local`。
> 端到端测试用 Vitest + @testing-library/react；UI 原子组件来自 shadcn/ui（手写薄包装）。

| 文件 / 目录 | 用途 | 何时修改 |
|---|---|---|
| `frontend/package.json` | 依赖与脚本（`dev` / `build` / `typecheck` / `lint` / `test` / `test:watch`） | 增/改前端依赖、调整脚本 |
| `frontend/.env.example` / `.env.local` | `VITE_API_BASE`，默认 `http://localhost:8000` | 后端地址变更、新增前端环境变量 |
| `frontend/vite.config.ts` / `vitest.config.ts` | Vite 与 Vitest 配置 | 调整 dev server 端口、Vitest 行为 |
| `frontend/tsconfig.json` / `tsconfig.node.json` | TS 配置（strict） | 调整 TS 选项 |
| `frontend/tailwind.config.js` / `postcss.config.js` / `index.html` | Tailwind / PostCSS / HTML 入口 | 调整样式系统、HTML 模板 |
| `frontend/components.json` | shadcn/ui 配置（`baseColor: slate`，`@/` 别名） | 调整 shadcn 别名、基色 |
| `frontend/eslint.config.js` | ESLint flat config | 调整 lint 规则 |
| `frontend/src/main.tsx` / `App.tsx` / `types.ts` / `index.css` | 入口、根组件、共享类型、全局样式 | 应用骨架变化时 |
| `frontend/src/components/` | Sidebar、ChatWindow、MessageList、MessageBubble、ChatInput、EmptyState（每个 `*.tsx` 旁有同名 `*.test.tsx`） | 增/改 UI 视图组件 |
| `frontend/src/components/ui/` | shadcn/ui 原子组件（button / dropdown-menu / scroll-area / sheet / sonner / textarea） | 升级 shadcn 组件、新增原子组件 |
| `frontend/src/context/ChatContext.tsx` | 全局聊天状态 Context | 增/改跨组件状态 |
| `frontend/src/hooks/useChat.ts` | 发送消息、AbortSignal 取消进行中请求 | 调整发送/取消语义 |
| `frontend/src/hooks/useConversations.ts` | 会话列表状态 | 调整会话持久化与切换 |
| `frontend/src/lib/api.ts` | `streamChat(messages, signal)`(SSE 异步生成器,逐 yield `step`/`done`/`error`)、`ChatApiError`;读 `VITE_API_BASE` | 后端接口契约变更 |
| `frontend/src/lib/storage.ts` | 本地存储封装 | 调整持久化方案 |
| `frontend/src/lib/utils.ts` | `cn` 等通用工具 | 新增前端工具 |
| `frontend/src/test/setup.ts` / `sanity.test.tsx` | Vitest 全局 setup 与冒烟测试 | 调整测试基础设施 |
| `frontend/README.md` | 前端开发指南（脚本、技术栈、目录） | 前端工作流变化时 |

### `tests/` —— 后端烟测

> 与 `backend/main.py` 一一对应。`pyproject.toml` 的 setuptools 已排除此包。

| 文件 | 内容 | 何时修改 |
|---|---|---|
| `tests/__init__.py` | 空包 | 新增测试包时 |
| `tests/test_backend.py` | `TestClient(app)` 跑 `/health`、空 messages 返 400、`/api/chat` 调用 `weather_agent`、CORS 任意 Origin | 增/改后端接口或异常分支 |

### `docs/superpowers/` —— 设计与实施文档

> 用 superpowers 工作流产出的设计/计划文档，按 `YYYY-MM-DD-<topic>.md` 命名。
> 后续新增功能时，按 `specs/` + `plans/` 的双文件约定补齐。

| 目录 | 用途 | 何时修改 |
|---|---|---|
| `docs/superpowers/specs/` | 设计规格（背景 / 目标 / 接口契约） | 新功能/重构启动前写设计稿 |
| `docs/superpowers/plans/` | 实施计划（按 spec 拆分任务） | 设计定稿后写实现计划 |
| `2026-06-12-weather-agent-backend-*.md` | 首版 FastAPI 后端的设计与计划 | 历史归档 |
| `2026-06-12-react-frontend-chat-*.md` | 首版 React 聊天前端的设计与计划 | 历史归档 |

## 常见修改任务速查

| 任务 | 涉及文件 |
|---|---|
| 新增一个智能体 | `agents/<name>/agent.py` + `agents/<name>/__init__.py` + `agents/__init__.py` |
| 切换智能体的 LLM provider | `agents/<name>/agent.py`（改 `get_singleton_client` 参数）+ `.env`（补对应变量） |
| 新增 LLM provider | `utils/langchain_model/llm_factory.py`（在 `_OPENAI_PROVIDERS` 注册或新增分支） + `.env`（补变量） |
| 调整 API 速率限制 | `utils/langchain_model/llm_factory.py` 的模块级 `rate_limiter` |
| 新增/改后端接口 | `backend/main.py`（路由）+ `backend/schemas.py`（请求/响应模型）+ `tests/test_backend.py`（同步加烟测） |
| 调整前端 API 地址 | `frontend/.env.example`（提交示例）+ `frontend/.env.local`（本地覆盖） |
| 新增前端 UI 组件 | `frontend/src/components/<Name>.tsx` + 同目录 `*.test.tsx` |
| 新增前端原子组件（shadcn） | `frontend/src/components/ui/<name>.tsx` |
| 调整前端状态/Ctx/钩子 | `frontend/src/context/ChatContext.tsx` / `frontend/src/hooks/*.ts` |
| 跑后端测试 | `uv run pytest`（见 `.claude/rules/tooling.md`） |
| 跑前端测试 | `cd frontend && pnpm test` |
| 调整 Python 规范 | `.claude/rules/python.md` |
| 新增/调整命令授权 | `.claude/settings.local.json` |
| 升级后端依赖 | `pyproject.toml` → `uv sync` → `uv.lock` 自动更新 |
| 升级前端依赖 | `frontend/package.json` → `cd frontend && pnpm install` |
| 写设计稿 / 实施计划 | `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` + `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` |
| 写发版说明 | `CHANGELOG.md` |
