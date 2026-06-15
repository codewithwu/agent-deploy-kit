# agent-deploy-kit

🚀 智能体一键部署工具包 - 开发者只需专注 LangChain 智能体逻辑，框架自动封装 FastAPI 接口 + React 前端，实现开箱即用的对话界面。

## 项目简介

`agent-deploy-kit` 是一个面向 LangChain 智能体的零配置部署脚手架。开发者只需在 `agents/<name>_agent/` 下写智能体（模型、工具、system_prompt），框架自动把它暴露为 FastAPI HTTP 接口（`/api/chat` + `/api/chat/stream` SSE），并附带一个开箱即用的 React 聊天界面——端到端可立刻跑通。

最小样例 `weather_agent` 已可用：说一句"北京天气怎么样？"，即可看到 **LLM 决策 → 工具调用 → 流式回答回显** 的完整链路。

## 特性

- **多 provider LLM 单例**：`utils/langchain_model` 内置 `ollama` / `nvidia` / `zhipu` / `bailing` / `siliconflow` / `modelscope` / `longcat` / `deepseek`，按环境变量切换
- **结构化工具**：`@tool(args_schema=...)` 示例展示 LangChain 1.x Pydantic 工具的标准写法
- **流式对话**：后端 SSE + 前端实时聚合渲染、任务列表、思考占位与失败重试
- **质量门全套**：ruff / mypy / pytest（后端） · ESLint / `tsc --noEmit` / Vitest（前端）

## 技术栈

- **后端**：Python 3.13+ / FastAPI / LangChain 1.3+ / Pydantic / `uv`
- **前端**：Vite 5 + React 18 + TypeScript 5 + Tailwind 3 + shadcn/ui + pnpm

## Run the frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local   # 可选，默认指向 http://localhost:8000
pnpm dev
# 打开 http://localhost:5173
```

## Run the backend

```bash
# 在另一个终端，从仓库根目录运行
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
# 健康检查: curl http://localhost:8000/health
```

依赖、LLM provider、环境变量等细节见仓库根的 `CLAUDE.md`。

## Agent 配置

后端通过 `AGENT_NAME` 环境变量动态选择要加载的智能体；`backend/agent_loader.py` 在启动时按 `AGENT_NAME=weather_agent` → `agents/weather_agent/agent.py` 路径导入同名实例，缓存到进程退出。

### 设置方式

```bash
# 命令行临时生效
AGENT_NAME=weather_agent uv run uvicorn backend.main:app

# 写进 .env 持久化
echo "AGENT_NAME=weather_agent" >> .env
```

### 切换智能体

把 `AGENT_NAME` 改成 `agents/` 下任意子目录名（如 `translator_agent`），重启服务即可加载新智能体；无需改动 `backend/main.py` 任何代码。

### 启动期校验（fail-fast）

任何配置错误都会在 uvicorn 启动阶段直接失败，不会延后到首个请求：

| 错误 | 抛出 |
|------|------|
| 未设 `AGENT_NAME` | `RuntimeError` |
| 子包不存在 | `ModuleNotFoundError` |
| 子包未导出同名实例 | `RuntimeError` |

### 添加新智能体的最小步骤

1. 在 `agents/<name>_agent/` 下新建子目录，含 `agent.py` 与 `tools.py`。
2. `agent.py` 导出 `<name>_agent = create_agent(...)`。
3. 改 `AGENT_NAME=<name>` 并重启服务。

完整约定见 `agents/CLAUDE.md`。
