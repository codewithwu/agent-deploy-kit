# React 聊天前端 — 设计文档

- **日期**：2026-06-12
- **关联后端**：`backend/main.py` 的 `POST /api/chat`（已在仓库内实现）
- **关联智能体**：`agents/weather_agent/agent.py`
- **目标**：在 `frontend/` 下交付一个 React 单页应用，让用户通过浏览器与 LangChain 智能体对话，刷新页面后历史不丢。

## 1. 背景与目标

仓库 `agent-deploy-kit` 是一套"智能体零配置部署"脚手架。后端 FastAPI 已就绪：

- `POST /api/chat` 接收 `{ messages: [{ role, content }] }`，返回 `{ reply: string }`。
- CORS 已放开 `allow_origins=["*"]`。
- 当前智能体为 `weather_agent`（占位实现，返回 `"It's always sunny in {city}!"`）。

**本任务新增前端**，为这套后端提供可视化对话界面。MVP 之后可承载任意新增的智能体。

## 2. 非目标

- 不实现流式输出（SSE/WebSocket）；与后端非流式契约对齐。
- 不引入多用户 / 鉴权 / 账户体系；前端完全跑在浏览器，所有状态在 localStorage。
- 不交付 Docker 镜像 / CI 配置 / Playwright 端到端测试。
- 不替换或修改后端实现。

## 3. 技术栈

| 维度 | 选型 | 理由 |
|---|---|---|
| 构建工具 | Vite 5 | 启动快、HMR 稳定、零配置起步 |
| 框架 | React 18 | 用户明确要求 |
| 语言 | TypeScript 5（strict） | 与后端 Pydantic 强类型契约对齐；项目强类型偏好 |
| 样式 | Tailwind CSS 3 | utility-first；与 shadcn/ui 配套 |
| 组件 | shadcn/ui（按需 copy） | Radix 底座 a11y 完备；无运行时依赖 |
| Markdown | react-markdown + remark-gfm | 表格 / 任务列表 / 删除线 |
| 代码高亮 | react-syntax-highlighter | 智能体回复常见代码块 |
| 状态 | useState + React Context | 单页聊天场景够用；零额外依赖 |
| 持久化 | localStorage | 浏览器原生；单设备单用户足够 |
| HTTP | 原生 `fetch` + `AbortController` | 切会话时能取消进行中请求 |
| 包管理 | pnpm | 与 npm 兼容，磁盘占用更小 |
| 测试 | Vitest + @testing-library/react | 与 Vite 同生态，零额外配置 |
| Lint | ESLint + @typescript-eslint + react-hooks | 标准组合 |

## 4. 项目结构

```
agent-deploy-kit/
└── frontend/
    ├── index.html
    ├── package.json
    ├── pnpm-lock.yaml
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── components.json              # shadcn/ui 配置
    ├── .env.example                 # VITE_API_BASE=http://localhost:8000
    ├── .gitignore                   # node_modules, dist, .env.local, coverage
    ├── README.md                    # 启动 / 构建 / 测试说明
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css                # Tailwind 入口 + CSS 变量
        ├── lib/
        │   ├── utils.ts             # shadcn cn() helper
        │   ├── api.ts               # postChat() + ChatApiError
        │   └── storage.ts           # localStorage 读写 + 版本号
        ├── types.ts                 # ChatMessage / Conversation / Role
        ├── context/
        │   └── ChatContext.tsx      # 全局会话状态 + 操作
        ├── hooks/
        │   ├── useConversations.ts  # 增删改查 + 自动持久化
        │   └── useChat.ts           # 发送消息副作用
        └── components/
            ├── ui/                  # shadcn 生成: button, input, scroll-area,
            │                        #   sonner(toast), dropdown-menu, sheet,
            │                        #   tooltip, separator, avatar
            ├── Sidebar.tsx
            ├── ChatWindow.tsx
            ├── MessageList.tsx
            ├── MessageBubble.tsx
            ├── ChatInput.tsx
            └── EmptyState.tsx
```

**骨架原则**：
- 纯展示组件（`Sidebar` / `ChatInput` / `MessageBubble` 等）只接 props，零副作用。
- 副作用（持久化、fetch、AbortController）下沉到 `hooks/`。
- 全局状态只放 `ChatContext`；具体变更函数拆到 `useConversations`。

## 5. 数据模型

```ts
// src/types.ts
export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;           // 客户端生成,用于 React key
  role: Role;
  content: string;
  createdAt: number;    // Date.now()
  pending?: boolean;    // 用户刚发出、等待后端响应时为 true
  error?: boolean;      // 请求失败标记,支持重试
}

export interface Conversation {
  id: string;           // uuid
  title: string;        // 首条用户消息前 30 字;可在侧边栏重命名
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
```

**派生标题**：新建空会话时 `title = "新对话"`；用户发出首条消息后异步把 `title` 更新为该消息前 30 字（在 `useChat.send` 内一并处理）。

## 6. Context 接口

```ts
// src/context/ChatContext.tsx
interface ChatContextValue {
  conversations: Conversation[];
  currentId: string | null;
  current: Conversation | null;     // 派生: conversations.find(...) ?? null

  createConversation: () => string; // 返回新 id,自动切到新会话
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  clearCurrent: () => void;         // "清空消息"按钮
  addMessage: (id: string, message: ChatMessage) => void;
  updateMessage: (
    id: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ) => void;
  renameIfFirstUserMessage: (id: string, content: string) => void;
}
```

`useConversations` 内部维护状态，并通过单一 `useEffect` 监听 `conversations` 变化同步到 localStorage；启动时 `useEffect(() => …, [])` 从 localStorage 水合，解析失败 / 版本不匹配时回退到空数组。

localStorage key：`adk:conversations:v1`，带 `v1` 后缀方便未来不兼容升级。`pending` / `error` 字段**不**持久化（刷新即丢失，符合预期）。

## 7. 发送 / 接收 / 错误处理

### `useChat.send(text)` 流程

```
1. trim + 长度判空,空则直接 return
2. 若 currentId === null → createConversation() 取得 id
3. 构造 userMsg { role:'user', content:text, pending:true }
4. context.addMessage(currentId, userMsg)        // UI 状态:气泡显示为"发送中"
5. 构造 API 载荷: 从 current.messages 过滤掉所有 pending 与 error,
                  映射为 { role, content },再追加 { role:'user', content:text }
   (本地 userMsg 仍保留 pending=true;载荷里它是普通已发消息)
6. fetch(POST `${VITE_API_BASE}/api/chat`, { body: { messages }, signal })
   ├─ 成功:
   │  - addMessage({ role:'assistant', content:reply })
   │  - 若是该会话首条用户消息 → 自动重命名 title 为前 30 字
   └─ 失败:
      - 把 userMsg 的 pending 改为 false、error 改为 true(气泡变红+重试)
      - toast.error(按 status 给出文案)
7. scroll to bottom
```

### 关键决策

- **非流式**：与后端 `ChatResponse{reply:string}` 对齐。后续后端支持流式时，仅升级 `useChat` + `MessageBubble` 即可。
- **载荷始终是完整 `messages[]`**：后端 stateless，前端负责维护 history。
- **重试**：失败消息旁显"重试"按钮，点了 → 删掉 error 消息 → 重新调 `send` 用相同内容。
- **Abort**：切换会话 / 组件卸载时 `AbortController.abort()`，避免串台。
- **空消息防护**：`send` 开头 trim + 长度判空。

### 网络层

```ts
// src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export class ChatApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function postChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail ?? res.statusText;
    throw new ChatApiError(res.status, String(detail));
  }
  const data = (await res.json()) as { reply: string };
  return data.reply;
}
```

`status` 决定文案：400 → "消息不能为空"；500 → "智能体暂时不可用"；其他 → 后端 `detail` 或 "请求失败"。

## 8. UI 布局与组件契约

### 整体布局

桌面端两栏：左侧 `Sidebar`（固定 280px） + 右侧 `ChatWindow`（flex-1）。
窄屏（< 768px）：Sidebar 折叠成 `Sheet`（抽屉），由 ChatWindow 顶栏汉堡按钮唤起。

```
┌──────────────┬─────────────────────────────────────┐
│  [+ 新对话]  │  顶部条: 智能体名 / 移动端菜单按钮  │
│ ──────────── │ ────────────────────────────────── │
│ ▸ 北京天气…  │                                     │
│   今天穿…    │        消息列表(滚动区)             │
│ ▸ Python 题  │                                     │
│   帮我写…    │                                     │
│              │ ────────────────────────────────── │
│              │  [输入框........................] ↵ │
└──────────────┘─────────────────────────────────────┘
```

### 组件契约

| 组件 | Props | 行为 |
|---|---|---|
| `Sidebar` | `conversations`, `currentId`, `onSelect`, `onCreate`, `onDelete`, `onRename` | 列表 + DropdownMenu(重命名/删除)；空态不显示 |
| `ChatWindow` | `current`, `onSend`, `onClear`, `onDeleteCurrent` | 顶栏、消息列表、输入框 |
| `MessageList` | `messages: ChatMessage[]` | 滚动容器；新消息自动滚到底；pending 显示"正在输入…"气泡 |
| `MessageBubble` | `message`, `onRetry?` | 用户右对齐灰底,助手左对齐白底；content 经 Markdown；`error` 时红框 + 重试按钮 |
| `ChatInput` | `disabled`, `onSend(text)` | 多行 textarea；Enter 发送、Shift+Enter 换行；发送后清空 |
| `EmptyState` | — | 无 current 时显示,引导点"新对话" |

### Markdown 渲染

`react-markdown` + `remark-gfm`（表格/任务列表/删除线）+ `react-syntax-highlighter`（代码块，主题 `oneDark`）。白名单 URL 协议，避免 `javascript:` XSS。

### 错误反馈分层

- 全局：`toast.error(…)`（shadcn `sonner`）一次性提示。
- 消息级：气泡红边 + 文字"发送失败" + 重试按钮。
- 输入态：`isSending` 时输入框禁用，发送按钮变 spinner。

### 可访问性

- 重命名/删除用 DropdownMenu + Tooltip。
- 输入框 `<label>` 关联。
- 消息列表 `role="log"` + `aria-live="polite"`。

## 9. 测试

| 层 | 范围 | 工具 |
|---|---|---|
| 单元 | `storage.ts` 序列化/反序列化；`postChat` 成功 / 4xx / 5xx / 网络错误；`useConversations` 增删改查 | Vitest |
| 组件 | `MessageBubble` 渲染 Markdown 与 error 态；`ChatInput` Enter / Shift+Enter 行为；`Sidebar` 选中态高亮 | Vitest + @testing-library/react |

不引入 MSW（`postChat` 一处 mock 即可），不写 Playwright（端到端测试不交付）。

## 10. 质量门（`package.json` scripts）

```jsonc
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

`build` 前置 `tsc --noEmit` 防止类型错误流入产物。

## 11. 环境变量

`.env.example`：

```
VITE_API_BASE=http://localhost:8000
```

`.env.local` 在 `.gitignore` 中。Vite 仅暴露 `VITE_` 前缀变量给客户端。

## 12. 开发体验

- 端口：`5173`，`strictPort: true`。
- 路径别名：`@/*` → `src/*`（`tsconfig.json` + `vite.config.ts` 双向配置）。
- HMR 默认开启。
- `frontend/README.md` 记录 `pnpm install` / `pnpm dev` / `pnpm build` / `pnpm test` 流程。

## 13. 部署

本任务只交付源码 + 本地运行。`pnpm build` 产出 `frontend/dist/`，是标准静态文件，可由后续 FastAPI `StaticFiles` 挂载或任意 CDN/静态服务器承载。Docker / CI 不在本期范围。

## 14. 风险与限制

- **localStorage 容量**：单源 5–10 MB，正常使用远低于上限；若未来消息极长需做截断。
- **大上下文**：每次发送都带完整 history，超长会话会拖慢首 token 延迟——MVP 不优化。
- **跨设备同步**：无；如需登录 + 云端 history，是另一期工作。
- **后端变更**：若后端改为流式输出或新增 `session_id` 概念，本前端需升级 `useChat` + `MessageBubble`。

## 15. 交付清单

1. `frontend/` 完整源码（结构见第 4 节）。
2. `frontend/.env.example` + `frontend/README.md` + `frontend/.gitignore`。
3. 根 `README.md` 新增 "Run the frontend" 一段。
4. 单元 + 组件测试通过；`pnpm build` 成功。
