# Agent Deploy Kit — Frontend

Vite + React + TypeScript 单页聊天前端，调用后端 `POST /api/chat`。

## 开发

```bash
# 1. 安装依赖
pnpm install

# 2. 启动后端（另一终端）
cd .. && source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000

# 3. 配置 API 地址（可选，默认 http://localhost:8000）
cp .env.example .env.local

# 4. 启动前端
pnpm dev
# 打开 http://localhost:5173
```

## 脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 Vite dev server (5173) |
| `pnpm build` | 类型检查 + 生产构建到 `dist/` |
| `pnpm preview` | 预览生产构建 |
| `pnpm typecheck` | 仅 TypeScript 类型检查 |
| `pnpm lint` | ESLint |
| `pnpm test` | 跑 Vitest 一次 |
| `pnpm test:watch` | 监听模式跑测试 |

## 技术栈

- Vite 5 / React 18 / TypeScript 5 (strict)
- Tailwind CSS 3 + shadcn/ui
- react-markdown + remark-gfm + react-syntax-highlighter
- Vitest + @testing-library/react

## 目录

```
src/
├── components/      # UI 组件（Sidebar / ChatWindow / ...）
├── context/         # ChatContext
├── hooks/           # useConversations / useChat
├── lib/             # api / storage / utils
├── test/            # Vitest setup
└── types.ts
```
