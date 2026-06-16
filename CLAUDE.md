# CLAUDE.md

@.claude/rules/behavioral.md
@.claude/rules/python.md
@.claude/rules/tooling.md
@.claude/rules/frontend.md

## 项目

Agent Deploy Kit — LangChain 智能体零配置部署为 Web 应用的脚手架。

## 环境与栈

- **Python**: 3.13+（见 `.python-version`）
- **包管理**: `uv`，清华源已配置（项目禁用 `pip`）
- **后端**: FastAPI / LangChain
- **前端**: React 18 + Vite + TypeScript
- **前端包管理**: `pnpm`（与后端 `uv` 对应；不用 npm/yarn）
- **前端测试**: Vitest（非 Jest）
- **质量**: ruff / mypy / pytest / eslint

## 基础设施

- compose 在 `docker/<svc>/docker-compose.yml`（每个服务一个子目录）
- 容器操作一律用 `scripts/docker/<svc>.sh`，**禁止直接 `docker compose`**

## 操作约定

- 代码修改 / 优化 / 新增前，先看 `@code_map.md` 了解仓库结构，再做针对性操作
