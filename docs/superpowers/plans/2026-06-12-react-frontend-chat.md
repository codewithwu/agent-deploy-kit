# React 聊天前端 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `frontend/` 下交付一个 React + TypeScript 单页聊天应用，调用 `backend/main.py` 的 `POST /api/chat`，支持多会话、Markdown/代码高亮、localStorage 持久化。

**Architecture:** Vite 5 + React 18 + TS 5；Tailwind 3 + shadcn/ui；`useState` + React Context 管会话；`useEffect` 同步 localStorage；`fetch` + `AbortController` 调后端；测试用 Vitest + @testing-library/react。

**Tech Stack:** Vite 5 / React 18 / TypeScript 5 / Tailwind 3 / shadcn/ui / react-markdown / react-syntax-highlighter / Vitest 1.x / @testing-library/react / pnpm。

**Spec:** `docs/superpowers/specs/2026-06-12-react-frontend-chat-design.md`

**Working directory:** 所有路径相对于仓库根 `agent-deploy-kit/`。

---

## 全局约定

- 包管理器：**pnpm**。所有依赖通过 `pnpm add` / `pnpm add -D` 安装。
- 路径别名：`@/*` → `src/*`（`tsconfig.json` 和 `vite.config.ts` 同时配置）。
- Node 版本：≥ 18（Vite 5 要求）。
- TypeScript 严格模式：`tsconfig.json` 启用 `"strict": true`。
- 测试：Vitest 1.x + jsdom。
- 提交规范：遵循仓库现有 `feat(frontend):` / `test(frontend):` / `chore(frontend):` 风格。
- 每个 Task 末尾独立 commit；commit 之前 `pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿。

---

## Task 1: 项目脚手架

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/.gitignore`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/vite-env.d.ts`

- [ ] **Step 1: 创建 frontend 目录并初始化 package.json**

```bash
mkdir -p frontend/src
cd frontend
cat > package.json <<'JSON'
{
  "name": "agent-deploy-kit-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
JSON
```

- [ ] **Step 2: 安装运行时依赖与开发依赖**

```bash
cd frontend
pnpm add react@18 react-dom@18
pnpm add -D vite@5 @vitejs/plugin-react@4 typescript@5 @types/react@18 @types/react-dom@18
pnpm add clsx tailwind-merge class-variance-authority
pnpm add lucide-react
```

**预期**：无错误；`node_modules/` 生成。

- [ ] **Step 3: 创建 `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

注：`@testing-library/jest-dom` 类型会在 Task 5 安装；本 Task 先写配置，若 IDE 报错可忽略，到 Task 5 自动解决。

- [ ] **Step 4: 创建 `frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: 创建 `frontend/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

- [ ] **Step 6: 创建 `frontend/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Deploy Kit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 创建 `frontend/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 8: 创建 `frontend/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 9: 创建 `frontend/src/App.tsx`**

```tsx
export default function App() {
  return <div>Agent Deploy Kit</div>;
}
```

- [ ] **Step 10: 创建 `frontend/.gitignore`**

```
node_modules
dist
dist-ssr
*.local

# 测试与覆盖率
coverage

# 调试
.vite

# 编辑器
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# 环境变量
.env
.env.local
.env.*.local
```

- [ ] **Step 11: 验证 dev server 能起**

```bash
cd frontend
pnpm dev &
sleep 3
curl -sf http://localhost:5173/ | head -20
kill %1
```

**预期**：HTML 响应包含 `<div id="root">` 与 `main.tsx` 引用。

- [ ] **Step 12: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): scaffold Vite + React + TS"
```

---

## Task 2: Tailwind CSS

**Files:**
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: 安装 Tailwind 与 PostCSS 依赖**

```bash
cd frontend
pnpm add -D tailwindcss@3 postcss autoprefixer
```

- [ ] **Step 2: 创建 `frontend/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: 创建 `frontend/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: 创建 `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 47.4% 11.2%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 47.4% 11.2%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 47.4% 11.2%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family:
      ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  }
}
```

- [ ] **Step 5: 在 `frontend/src/main.tsx` 引入 index.css**

修改 `frontend/src/main.tsx`：

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: 临时验证：把 App.tsx 改成有 Tailwind class 的元素**

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-2xl font-bold">Agent Deploy Kit</h1>
      <button className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground">
        Tailwind OK
      </button>
    </div>
  );
}
```

启动 dev server：

```bash
cd frontend
pnpm dev &
sleep 3
curl -sf http://localhost:5173/src/index.css | head -5
kill %1
```

**预期**：CSS 输出包含 Tailwind 编译结果（包含 `--tw-` 等工具类）。

- [ ] **Step 7: 把 App.tsx 还原为空占位**

```tsx
export default function App() {
  return <div>Agent Deploy Kit</div>;
}
```

- [ ] **Step 8: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add Tailwind CSS with shadcn theme tokens"
```

---

## Task 3: shadcn/ui 初始化

**Files:**
- Create: `frontend/components.json`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/components/ui/...` (由 CLI 生成)
- Create: `frontend/.env.example`

- [ ] **Step 1: 安装 shadcn 所需运行时依赖**

```bash
cd frontend
pnpm add @radix-ui/react-slot
pnpm add -D tailwindcss-animate
```

- [ ] **Step 2: 创建 `frontend/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 3: 创建 `frontend/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: 创建 `frontend/.env.example`**

```
VITE_API_BASE=http://localhost:8000
```

- [ ] **Step 5: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend
git -c user.name=cooper -c user.email=cooper@local commit -m "chore(frontend): add shadcn/ui config and cn helper"
```

---

## Task 4: 添加 shadcn 组件

**Files:**
- Create: `frontend/src/components/ui/button.tsx`
- Create: `frontend/src/components/ui/input.tsx`
- Create: `frontend/src/components/ui/textarea.tsx`
- Create: `frontend/src/components/ui/scroll-area.tsx`
- Create: `frontend/src/components/ui/sonner.tsx`
- Create: `frontend/src/components/ui/dropdown-menu.tsx`
- Create: `frontend/src/components/ui/sheet.tsx`
- Create: `frontend/src/components/ui/tooltip.tsx`
- Create: `frontend/src/components/ui/separator.tsx`
- Create: `frontend/src/components/ui/avatar.tsx`
- Create: `frontend/src/components/ui/skeleton.tsx`

- [ ] **Step 1: 安装 shadcn 组件所需的 Radix 依赖**

```bash
cd frontend
pnpm add @radix-ui/react-dropdown-menu @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-separator @radix-ui/react-avatar @radix-ui/react-scroll-area sonner
```

- [ ] **Step 2: 用 shadcn CLI 添加组件**

```bash
cd frontend
pnpm dlx shadcn@latest add button input textarea scroll-area sonner dropdown-menu sheet tooltip separator avatar skeleton --yes --overwrite
```

**预期**：每个组件的 .tsx 文件出现在 `src/components/ui/`；CLI 提示 "Success"。

- [ ] **Step 3: 检查生成的文件**

```bash
ls frontend/src/components/ui/
```

**预期**：`avatar.tsx button.tsx dropdown-menu.tsx input.tsx scroll-area.tsx separator.tsx sheet.tsx skeleton.tsx sonner.tsx textarea.tsx tooltip.tsx` 全在。

- [ ] **Step 4: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add shadcn/ui base components"
```

---

## Task 5: Vitest + 测试库

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/package.json` (新增 `test` 脚本已存在; 增加 coverage 可选)
- Create: `frontend/src/test/sanity.test.ts`

- [ ] **Step 1: 安装测试依赖**

```bash
cd frontend
pnpm add -D vitest@1 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitest/coverage-v8
```

- [ ] **Step 2: 创建 `frontend/vitest.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
```

- [ ] **Step 3: 创建 `frontend/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: 创建 `frontend/src/test/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

function Hello() {
  return <h1>Hello, test</h1>;
}

describe("sanity", () => {
  it("renders a component", () => {
    render(<Hello />);
    expect(screen.getByRole("heading", { name: /hello, test/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: 跑测试**

```bash
cd frontend
pnpm test
```

**预期**：`1 passed`。

- [ ] **Step 6: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend
git -c user.name=cooper -c user.email=cooper@local commit -m "test(frontend): set up Vitest + Testing Library"
```

---

## Task 6: 类型定义

**Files:**
- Create: `frontend/src/types.ts`

- [ ] **Step 1: 写 `frontend/src/types.ts`**

```ts
export type Role = "user" | "assistant";

export interface ChatMessage {
  /** 客户端生成,用于 React key 与重试定位 */
  id: string;
  role: Role;
  content: string;
  /** Date.now() */
  createdAt: number;
  /** 用户刚发出、等待后端响应时为 true */
  pending?: boolean;
  /** 请求失败标记,支持重试 */
  error?: boolean;
}

export interface Conversation {
  /** uuid */
  id: string;
  /** 首条用户消息前 30 字;可在侧边栏重命名 */
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** 后端 ChatRequest / ChatResponse 契约(只用到入参与出参) */
export interface ApiChatRequest {
  messages: { role: string; content: string }[];
}

export interface ApiChatResponse {
  reply: string;
}
```

- [ ] **Step 2: 验证类型检查通过**

```bash
cd frontend
pnpm typecheck
```

**预期**：无错误退出。

- [ ] **Step 3: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/types.ts
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): define core types"
```

---

## Task 7: Storage 层 (TDD)

**Files:**
- Create: `frontend/src/lib/storage.test.ts`
- Create: `frontend/src/lib/storage.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/lib/storage.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadConversations, saveConversations, STORAGE_KEY } from "./storage";
import type { Conversation } from "@/types";

const sample: Conversation[] = [
  {
    id: "c1",
    title: "hello",
    messages: [
      { id: "m1", role: "user", content: "hi", createdAt: 1, pending: true },
    ],
    createdAt: 1,
    updatedAt: 1,
  },
];

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when nothing is stored", () => {
    expect(loadConversations()).toEqual([]);
  });

  it("returns empty array on corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json{");
    expect(loadConversations()).toEqual([]);
  });

  it("strips pending and error flags when loading", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    const loaded = loadConversations();
    expect(loaded[0].messages[0].pending).toBeUndefined();
    expect(loaded[0].messages[0].error).toBeUndefined();
  });

  it("round-trips save -> load", () => {
    saveConversations(sample);
    const loaded = loadConversations();
    expect(loaded).toEqual([
      {
        id: "c1",
        title: "hello",
        messages: [
          { id: "m1", role: "user", content: "hi", createdAt: 1 },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/lib/storage.test.ts
```

**预期**：`Failed to resolve import "./storage"` 或类似未找到模块错误。

- [ ] **Step 3: 实现 `frontend/src/lib/storage.ts`**

```ts
import type { Conversation } from "@/types";

export const STORAGE_KEY = "adk:conversations:v1";

/** 加载并清理 transient 字段(pending / error) */
export function loadConversations(): Conversation[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((c) => stripTransient(c));
}

export function saveConversations(items: Conversation[]): void {
  // 持久化前剥掉 pending / error(双保险;通常内存状态也不应保留)
  const cleaned = items.map((c) => stripTransient(c));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

function stripTransient(c: Conversation): Conversation {
  return {
    ...c,
    messages: c.messages.map((m) => {
      const { pending: _p, error: _e, ...rest } = m;
      return rest;
    }),
  };
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/lib/storage.test.ts
```

**预期**：`4 passed`。

- [ ] **Step 5: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/lib/storage.ts frontend/src/lib/storage.test.ts
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add localStorage persistence with transient stripping"
```

---

## Task 8: API 层 (TDD)

**Files:**
- Create: `frontend/src/lib/api.test.ts`
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/lib/api.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postChat, ChatApiError } from "./api";

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("postChat", () => {
  it("returns reply on 200", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "hi there" }), { status: 200 }),
    );
    const reply = await postChat([{ role: "user", content: "hi" }]);
    expect(reply).toBe("hi there");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses VITE_API_BASE when set", async () => {
    vi.stubEnv("VITE_API_BASE", "https://api.example.com");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "ok" }), { status: 200 }),
    );
    await postChat([{ role: "user", content: "x" }]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/chat",
      expect.any(Object),
    );
    vi.unstubAllEnvs();
  });

  it("throws ChatApiError on non-2xx with detail from body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "messages must not be empty" }), {
        status: 400,
      }),
    );
    await expect(
      postChat([{ role: "user", content: "" }]),
    ).rejects.toMatchObject({
      status: 400,
      message: "messages must not be empty",
    });
  });

  it("throws ChatApiError on non-2xx without JSON body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("plain text error", { status: 500 }),
    );
    await expect(
      postChat([{ role: "user", content: "x" }]),
    ).rejects.toBeInstanceOf(ChatApiError);
  });

  it("passes AbortSignal through to fetch", async () => {
    const controller = new AbortController();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "ok" }), { status: 200 }),
    );
    await postChat([{ role: "user", content: "x" }], controller.signal);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/lib/api.test.ts
```

**预期**：模块未找到错误。

- [ ] **Step 3: 实现 `frontend/src/lib/api.ts`**

```ts
const DEFAULT_API_BASE = "http://localhost:8000";

/** 函数内读取,这样测试用 vi.stubEnv 改 VITE_API_BASE 才能生效 */
function apiBase(): string {
  return import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE;
}

export class ChatApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export async function postChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${apiBase()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok) {
    let detail: string;
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail = String(body.detail ?? res.statusText);
    } catch {
      detail = res.statusText;
    }
    throw new ChatApiError(res.status, detail);
  }
  const data = (await res.json()) as { reply: string };
  return data.reply;
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/lib/api.test.ts
```

**预期**：`5 passed`。

- [ ] **Step 5: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add /api/chat client with typed errors"
```

---

## Task 9: useConversations hook (TDD)

**Files:**
- Create: `frontend/src/hooks/useConversations.test.tsx`
- Create: `frontend/src/hooks/useConversations.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/hooks/useConversations.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversations } from "./useConversations";
import { STORAGE_KEY } from "@/lib/storage";

beforeEach(() => {
  localStorage.clear();
});

describe("useConversations", () => {
  it("starts with empty state", () => {
    const { result } = renderHook(() => useConversations());
    expect(result.current.conversations).toEqual([]);
    expect(result.current.currentId).toBeNull();
    expect(result.current.current).toBeNull();
  });

  it("hydrates from localStorage on mount", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "c1",
          title: "hi",
          messages: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );
    const { result } = renderHook(() => useConversations());
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].id).toBe("c1");
  });

  it("createConversation returns a new id and selects it", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    expect(typeof id).toBe("string");
    expect(id).not.toBe("");
    expect(result.current.currentId).toBe(id);
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].title).toBe("新对话");
  });

  it("addMessage appends to the specified conversation", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    act(() => {
      result.current.addMessage(id, {
        id: "m1",
        role: "user",
        content: "hi",
        createdAt: 100,
      });
    });
    expect(result.current.conversations[0].messages).toHaveLength(1);
    expect(result.current.conversations[0].messages[0].content).toBe("hi");
  });

  it("updateMessage patches a message in place", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
      result.current.addMessage(id, {
        id: "m1",
        role: "user",
        content: "hi",
        createdAt: 1,
        pending: true,
      });
    });
    act(() => {
      result.current.updateMessage(id, "m1", { pending: false, error: true });
    });
    const msg = result.current.conversations[0].messages[0];
    expect(msg.pending).toBe(false);
    expect(msg.error).toBe(true);
  });

  it("renameIfFirstUserMessage updates title for empty-title conv", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    act(() => {
      result.current.renameIfFirstUserMessage(id, "hello world");
    });
    expect(result.current.conversations[0].title).toBe("hello world");
  });

  it("renameIfFirstUserMessage still renames after a message is added", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
      result.current.addMessage(id, {
        id: "m1",
        role: "user",
        content: "first",
        createdAt: 1,
      });
    });
    act(() => {
      result.current.renameIfFirstUserMessage(id, "the first user message");
    });
    expect(result.current.conversations[0].title).toBe("the first user message");
  });

  it("renameIfFirstUserMessage truncates to 30 chars", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    const long = "a".repeat(50);
    act(() => {
      result.current.renameIfFirstUserMessage(id, long);
    });
    expect(result.current.conversations[0].title).toHaveLength(30);
  });

  it("deleteConversation removes and clears currentId if it was selected", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    act(() => {
      result.current.deleteConversation(id);
    });
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.currentId).toBeNull();
  });

  it("persists to localStorage on change", () => {
    const { result } = renderHook(() => useConversations());
    act(() => {
      result.current.createConversation();
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/hooks/useConversations.test.tsx
```

**预期**：模块未找到错误。

- [ ] **Step 3: 实现 `frontend/src/hooks/useConversations.ts`**

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage, Conversation } from "@/types";
import { loadConversations, saveConversations } from "@/lib/storage";

const TITLE_PLACEHOLDER = "新对话";
const TITLE_MAX = 30;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseConversationsValue {
  conversations: Conversation[];
  currentId: string | null;
  current: Conversation | null;
  createConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  clearCurrent: () => void;
  addMessage: (id: string, message: ChatMessage) => void;
  updateMessage: (
    id: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ) => void;
  renameIfFirstUserMessage: (id: string, content: string) => void;
}

export function useConversations(): UseConversationsValue {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 水合:从 localStorage 读一次
  useEffect(() => {
    const loaded = loadConversations();
    if (loaded.length > 0) {
      setConversations(loaded);
    }
    setHydrated(true);
  }, []);

  // 持久化:水合之后才写
  useEffect(() => {
    if (!hydrated) return;
    saveConversations(conversations);
  }, [conversations, hydrated]);

  const createConversation = useCallback((): string => {
    const id = newId();
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: TITLE_PLACEHOLDER,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [conv, ...prev]);
    setCurrentId(id);
    return id;
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrentId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setCurrentId((prev) => (prev === id ? null : prev));
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim() || TITLE_PLACEHOLDER;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, title: trimmed, updatedAt: Date.now() } : c,
      ),
    );
  }, []);

  const clearCurrent = useCallback(() => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentId ? { ...c, messages: [], updatedAt: Date.now() } : c,
      ),
    );
  }, [currentId]);

  const addMessage = useCallback((id: string, message: ChatMessage) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c,
      ),
    );
  }, []);

  const updateMessage = useCallback(
    (id: string, messageId: string, patch: Partial<ChatMessage>) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== id
            ? c
            : {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId ? { ...m, ...patch } : m,
                ),
                updatedAt: Date.now(),
              },
        ),
      );
    },
    [],
  );

  const renameIfFirstUserMessage = useCallback(
    (id: string, content: string) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          // 标题已被手动或之前自动重命名过 → 不动
          if (c.title !== TITLE_PLACEHOLDER) return c;
          const title = content.slice(0, TITLE_MAX);
          return { ...c, title, updatedAt: Date.now() };
        }),
      );
    },
    [],
  );

  const current = useMemo(
    () => conversations.find((c) => c.id === currentId) ?? null,
    [conversations, currentId],
  );

  return {
    conversations,
    currentId,
    current,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    clearCurrent,
    addMessage,
    updateMessage,
    renameIfFirstUserMessage,
  };
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/hooks/useConversations.test.tsx
```

**预期**：`9 passed`。

- [ ] **Step 5: 跑全套测试,确保没破坏之前的**

```bash
cd frontend
pnpm test
```

**预期**：全部通过。

- [ ] **Step 6: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/hooks/useConversations.ts frontend/src/hooks/useConversations.test.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add useConversations hook with persistence"
```

---

## Task 10: ChatContext

**Files:**
- Create: `frontend/src/context/ChatContext.tsx`
- Create: `frontend/src/context/ChatContext.test.tsx`

- [ ] **Step 1: 写失败测试 `frontend/src/context/ChatContext.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ChatProvider, useChatContext } from "./ChatContext";
import { STORAGE_KEY } from "@/lib/storage";

function Probe() {
  const ctx = useChatContext();
  return (
    <div>
      <span data-testid="count">{ctx.conversations.length}</span>
      <span data-testid="currentId">{ctx.currentId ?? "null"}</span>
      <button
        onClick={() => {
          const id = ctx.createConversation();
          ctx.addMessage(id, {
            id: "m1",
            role: "user",
            content: "hi",
            createdAt: 1,
          });
        }}
      >
        add
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("ChatContext", () => {
  it("throws when used outside provider", () => {
    expect(() => render(<Probe />)).toThrow(/ChatProvider/);
  });

  it("exposes state and actions through the provider", () => {
    render(
      <ChatProvider>
        <Probe />
      </ChatProvider>,
    );
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("currentId").textContent).toBe("null");
    act(() => {
      screen.getByRole("button", { name: /add/i }).click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/context/ChatContext.test.tsx
```

**预期**：模块未找到错误。

- [ ] **Step 3: 实现 `frontend/src/context/ChatContext.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import {
  useConversations,
  type UseConversationsValue,
} from "@/hooks/useConversations";

const ChatContext = createContext<UseConversationsValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const value = useConversations();
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): UseConversationsValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/context/ChatContext.test.tsx
```

**预期**：`2 passed`。

- [ ] **Step 5: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/context/ChatContext.tsx frontend/src/context/ChatContext.test.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add ChatContext with provider"
```

---

## Task 11: useChat hook (TDD)

**Files:**
- Create: `frontend/src/hooks/useChat.test.tsx`
- Create: `frontend/src/hooks/useChat.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/hooks/useChat.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ChatProvider } from "@/context/ChatContext";
import { useChat } from "./useChat";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return actual;
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatProvider>{children}</ChatProvider>;
}

describe("useChat.send", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns isSending flag that flips true->false across a call", async () => {
    let resolveReply!: (v: string) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveReply = (text: string) =>
            resolve(
              new Response(JSON.stringify({ reply: text }), { status: 200 }),
            );
        }),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.isSending).toBe(false);

    let sendPromise: Promise<void> = Promise.resolve();
    act(() => {
      sendPromise = result.current.send("hello");
    });
    await waitFor(() => expect(result.current.isSending).toBe(true));

    await act(async () => {
      resolveReply("hi back");
      await sendPromise;
    });
    expect(result.current.isSending).toBe(false);
  });

  it("appends user message (pending) and then assistant reply on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "hi there" }), { status: 200 }),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hello");
    });

    const ctx = result.current.context;
    expect(ctx.conversations).toHaveLength(1);
    const messages = ctx.conversations[0].messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("hello");
    expect(messages[0].pending).toBe(false);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("hi there");
  });

  it("marks user message as error on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "boom" }), { status: 500 }),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hello");
    });

    const msg = result.current.context.conversations[0].messages[0];
    expect(msg.error).toBe(true);
    expect(msg.pending).toBe(false);
  });

  it("ignores empty input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("   ");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.context.conversations).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/hooks/useChat.test.tsx
```

**预期**：模块未找到错误。

- [ ] **Step 3: 实现 `frontend/src/hooks/useChat.ts`**

```ts
import { useCallback, useRef, useState } from "react";
import { ChatApiError, postChat } from "@/lib/api";
import { useChatContext } from "@/context/ChatContext";
import type { ChatMessage } from "@/types";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseChatValue {
  send: (text: string) => Promise<void>;
  isSending: boolean;
  /** 把 context 一并暴露,方便测试断言 */
  context: ReturnType<typeof useChatContext>;
}

export function useChat(): UseChatValue {
  const ctx = useChatContext();
  const { conversations, currentId, addMessage, updateMessage, renameIfFirstUserMessage } =
    ctx;
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // 1. 确保有会话
      let id = currentId;
      if (!id) {
        id = ctx.createConversation();
      }

      // 2. 加 userMsg(pending)
      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
        pending: true,
      };
      addMessage(id, userMsg);

      // 3. 构造 API 载荷(从最新 state 取)
      const conv = conversations.find((c) => c.id === id);
      const history = (conv?.messages ?? [])
        .filter((m) => !m.pending && !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      const payload = [...history, { role: "user", content: trimmed }];

      // 4. 发送
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSending(true);
      try {
        const reply = await postChat(payload, controller.signal);
        addMessage(id, {
          id: newId(),
          role: "assistant",
          content: reply,
          createdAt: Date.now(),
        });
        renameIfFirstUserMessage(id, trimmed);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const status = err instanceof ChatApiError ? err.status : 0;
        const detail =
          err instanceof ChatApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "请求失败";
        updateMessage(id, userMsg.id, { pending: false, error: true });
        const toast = (
          globalThis as { toast?: { error: (msg: string) => void } }
        ).toast;
        const text =
          status === 400
            ? detail || "消息不能为空"
            : status >= 500
              ? "智能体暂时不可用"
              : detail || "请求失败";
        toast?.error(text);
      } finally {
        setIsSending(false);
        abortRef.current = null;
      }
    },
    [
      conversations,
      currentId,
      addMessage,
      updateMessage,
      renameIfFirstUserMessage,
      ctx,
    ],
  );

  return { send, isSending, context: ctx };
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/hooks/useChat.test.tsx
```

**预期**：`4 passed`。

- [ ] **Step 5: 跑全套**

```bash
cd frontend
pnpm test
```

**预期**：全部通过。

- [ ] **Step 6: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/hooks/useChat.ts frontend/src/hooks/useChat.test.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add useChat hook for send/receive/error"
```

---

## Task 12: EmptyState 组件

**Files:**
- Create: `frontend/src/components/EmptyState.tsx`

- [ ] **Step 1: 写 `frontend/src/components/EmptyState.tsx`**

```tsx
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onCreate: () => void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <MessageSquareText
        className="h-12 w-12 text-muted-foreground"
        aria-hidden
      />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">开始一段新对话</h2>
        <p className="text-sm text-muted-foreground">
          选择左侧"新对话",向智能体提问。
        </p>
      </div>
      <Button onClick={onCreate}>新对话</Button>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
cd frontend
pnpm typecheck
```

**预期**：无错误。

- [ ] **Step 3: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/EmptyState.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add EmptyState component"
```

---

## Task 13: MessageBubble (TDD)

**Files:**
- Create: `frontend/src/components/MessageBubble.test.tsx`
- Create: `frontend/src/components/MessageBubble.tsx`

- [ ] **Step 1: 写失败测试 `frontend/src/components/MessageBubble.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "@/types";

const userMsg: ChatMessage = {
  id: "u1",
  role: "user",
  content: "hi",
  createdAt: 1,
};

const assistantMsg: ChatMessage = {
  id: "a1",
  role: "assistant",
  content: "**hello**",
  createdAt: 1,
};

const errorMsg: ChatMessage = {
  id: "e1",
  role: "user",
  content: "boom",
  createdAt: 1,
  error: true,
};

const pendingMsg: ChatMessage = {
  id: "p1",
  role: "user",
  content: "...",
  createdAt: 1,
  pending: true,
};

describe("MessageBubble", () => {
  it("renders user message content", () => {
    render(<MessageBubble message={userMsg} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("renders assistant markdown as <strong>", () => {
    render(<MessageBubble message={assistantMsg} />);
    const strong = screen.getByText("hello");
    expect(strong.tagName).toBe("STRONG");
  });

  it("shows retry button when message has error and onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<MessageBubble message={errorMsg} onRetry={onRetry} />);
    const btn = screen.getByRole("button", { name: /重试/i });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledWith(errorMsg);
  });

  it("does not show retry button when onRetry is not provided", () => {
    render(<MessageBubble message={errorMsg} />);
    expect(screen.queryByRole("button", { name: /重试/i })).toBeNull();
  });

  it("shows pending indicator for pending user message", () => {
    render(<MessageBubble message={pendingMsg} />);
    expect(screen.getByText(/发送中/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/components/MessageBubble.test.tsx
```

**预期**：模块未找到错误。

- [ ] **Step 3: 安装 react-markdown 依赖**

```bash
cd frontend
pnpm add react-markdown remark-gfm react-syntax-highlighter
pnpm add -D @types/react-syntax-highlighter
```

- [ ] **Step 4: 实现 `frontend/src/components/MessageBubble.tsx`**

```tsx
import { RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
}

/** 仅放行 http(s) 与 mailto,挡住 javascript: */
function safeUrl(url: string): string | null {
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return null;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
          isUser
            ? "border-primary/20 bg-primary/10"
            : "border-border bg-card",
          message.error && "border-destructive bg-destructive/10",
        )}
      >
        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const safe = href && safeUrl(href);
                if (!safe) return <span>{children}</span>;
                return (
                  <a href={safe} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
              code(props) {
                const { className, children } = props;
                const match = /language-(\w+)/.exec(className ?? "");
                const code = String(children).replace(/\n$/, "");
                if (match) {
                  return (
                    <SyntaxHighlighter
                      language={match[1]}
                      style={oneDark}
                      PreTag="div"
                      customStyle={{
                        fontSize: "0.8rem",
                        borderRadius: "0.375rem",
                        margin: "0.5rem 0",
                      }}
                    >
                      {code}
                    </SyntaxHighlighter>
                  );
                }
                return (
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {message.pending && (
          <div className="mt-1 text-xs text-muted-foreground">发送中…</div>
        )}
        {message.error && (
          <div className="mt-1 flex items-center gap-2 text-xs text-destructive">
            <span>发送失败</span>
            {onRetry && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => onRetry(message)}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                重试
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/components/MessageBubble.test.tsx
```

**预期**：`5 passed`。

- [ ] **Step 6: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/MessageBubble.tsx frontend/src/components/MessageBubble.test.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add MessageBubble with Markdown + code highlight + retry"
```

---

## Task 14: ChatInput (TDD)

**Files:**
- Create: `frontend/src/components/ChatInput.test.tsx`
- Create: `frontend/src/components/ChatInput.tsx`

- [ ] **Step 1: 写失败测试 `frontend/src/components/ChatInput.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("calls onSend with trimmed text on Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "hello world{enter}");
    expect(onSend).toHaveBeenCalledWith("hello world");
    expect(textarea).toHaveValue("");
  });

  it("does not call onSend on Shift+Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "line one{shift>}{enter}{/shift}line two");
    expect(onSend).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toContain("line one");
    expect((textarea as HTMLTextAreaElement).value).toContain("line two");
  });

  it("does not call onSend with whitespace-only text", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("is disabled and shows spinner-like state when disabled=true", () => {
    render(<ChatInput onSend={() => {}} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/components/ChatInput.test.tsx
```

**预期**：模块未找到错误。

- [ ] **Step 3: 实现 `frontend/src/components/ChatInput.tsx`**

```tsx
import { useState, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <div className="flex items-end gap-2 border-t border-border bg-background p-4">
      <label htmlFor="chat-input" className="sr-only">
        输入消息
      </label>
      <Textarea
        id="chat-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息,Enter 发送,Shift+Enter 换行"
        disabled={disabled}
        rows={1}
        className="min-h-[40px] resize-none"
      />
      <Button
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
        size="icon"
        aria-label="发送"
      >
        {disabled ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/components/ChatInput.test.tsx
```

**预期**：`4 passed`。

- [ ] **Step 5: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/ChatInput.tsx frontend/src/components/ChatInput.test.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add ChatInput with Enter/Shift+Enter handling"
```

---

## Task 15: MessageList (TDD)

**Files:**
- Create: `frontend/src/components/MessageList.test.tsx`
- Create: `frontend/src/components/MessageList.tsx`

- [ ] **Step 1: 写失败测试 `frontend/src/components/MessageList.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { ChatMessage } from "@/types";

const messages: ChatMessage[] = [
  { id: "m1", role: "user", content: "hi", createdAt: 1 },
  { id: "m2", role: "assistant", content: "hello", createdAt: 2 },
];

describe("MessageList", () => {
  it("renders a log role and all messages", () => {
    render(<MessageList messages={messages} />);
    const log = screen.getByRole("log");
    expect(log).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders empty list without crashing", () => {
    render(<MessageList messages={[]} />);
    expect(screen.getByRole("log")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/components/MessageList.test.tsx
```

**预期**：模块未找到错误。

- [ ] **Step 3: 实现 `frontend/src/components/MessageList.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "@/types";

interface MessageListProps {
  messages: ChatMessage[];
  onRetry?: (message: ChatMessage) => void;
}

export function MessageList({ messages, onRetry }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <ScrollArea className="flex-1">
      <div
        role="log"
        aria-live="polite"
        className="flex flex-col gap-3 p-4"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onRetry={onRetry} />
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/components/MessageList.test.tsx
```

**预期**：`2 passed`。

- [ ] **Step 5: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/MessageList.tsx frontend/src/components/MessageList.test.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add MessageList with auto-scroll and aria-live"
```

---

## Task 16: Sidebar (TDD)

**Files:**
- Create: `frontend/src/components/Sidebar.test.tsx`
- Create: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: 写失败测试 `frontend/src/components/Sidebar.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import type { Conversation } from "@/types";

const convs: Conversation[] = [
  { id: "c1", title: "first", messages: [], createdAt: 1, updatedAt: 1 },
  { id: "c2", title: "second", messages: [], createdAt: 2, updatedAt: 2 },
];

describe("Sidebar", () => {
  it("renders all conversation titles", () => {
    render(
      <Sidebar
        conversations={convs}
        currentId="c1"
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("highlights the current conversation", () => {
    render(
      <Sidebar
        conversations={convs}
        currentId="c1"
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );
    const c1 = screen.getByText("first").closest("button");
    expect(c1).toHaveAttribute("aria-current", "true");
  });

  it("calls onCreate when 新对话 is clicked", () => {
    const onCreate = vi.fn();
    render(
      <Sidebar
        conversations={[]}
        currentId={null}
        onSelect={() => {}}
        onCreate={onCreate}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /新对话/ }));
    expect(onCreate).toHaveBeenCalled();
  });

  it("calls onSelect when a conversation is clicked", () => {
    const onSelect = vi.fn();
    render(
      <Sidebar
        conversations={convs}
        currentId={null}
        onSelect={onSelect}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("first"));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd frontend
pnpm test src/components/Sidebar.test.tsx
```

**预期**：模块未找到错误。

- [ ] **Step 3: 实现 `frontend/src/components/Sidebar.tsx`**

```tsx
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function Sidebar({
  conversations,
  currentId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-[280px] flex-col border-r border-border bg-muted/30">
      <div className="border-b border-border p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          新对话
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2" aria-label="对话列表">
        {conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            还没有对话
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((c) => {
              const isCurrent = c.id === currentId;
              return (
                <li key={c.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-md",
                      isCurrent && "bg-accent",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-current={isCurrent ? "true" : undefined}
                      className={cn(
                        "flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                        isCurrent && "font-medium",
                      )}
                    >
                      {c.title || "新对话"}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          aria-label="更多操作"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            const next = window.prompt("重命名", c.title);
                            if (next != null) onRename(c.id, next);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            if (window.confirm(`删除对话"${c.title}"?`)) {
                              onDelete(c.id);
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd frontend
pnpm test src/components/Sidebar.test.tsx
```

**预期**：`4 passed`。

- [ ] **Step 5: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/Sidebar.tsx frontend/src/components/Sidebar.test.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add Sidebar with rename/delete dropdown"
```

---

## Task 17: ChatWindow

**Files:**
- Create: `frontend/src/components/ChatWindow.tsx`

- [ ] **Step 1: 写 `frontend/src/components/ChatWindow.tsx`**

```tsx
import { useState } from "react";
import { Menu, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { useChat } from "@/hooks/useChat";
import { useChatContext } from "@/context/ChatContext";
import type { ChatMessage } from "@/types";

interface ChatWindowProps {
  /** 智能体名,显示在顶栏 */
  agentName?: string;
  /** 移动端侧边栏 open 状态由父组件控制(可选,本组件内自带) */
}

export function ChatWindow({ agentName = "Weather Agent" }: ChatWindowProps) {
  const ctx = useChatContext();
  const { send, isSending } = useChat();
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleSend(text: string) {
    void send(text);
  }

  function handleRetry(msg: ChatMessage) {
    // MVP 重试:直接重发,error 消息保留在 UI 上(用户能看到发送失败的痕迹),
    // 后续改进是把 error 消息从 messages 中删掉再 send,避免重复条目。
    // 详见 plan 末尾"已知遗留"。
    void send(msg.content);
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="打开侧边栏"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <Sidebar
              conversations={ctx.conversations}
              currentId={ctx.currentId}
              onSelect={(id) => {
                ctx.selectConversation(id);
                setSheetOpen(false);
              }}
              onCreate={() => {
                ctx.createConversation();
                setSheetOpen(false);
              }}
              onDelete={ctx.deleteConversation}
              onRename={ctx.renameConversation}
            />
          </SheetContent>
        </Sheet>
        <Bot className="h-5 w-5 text-muted-foreground" aria-hidden />
        <h1 className="text-base font-semibold">{agentName}</h1>
        {ctx.current && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="清空消息"
              onClick={() => {
                if (window.confirm("清空当前会话的所有消息?")) {
                  ctx.clearCurrent();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </header>
      {ctx.current && ctx.current.messages.length > 0 ? (
        <MessageList
          messages={ctx.current.messages}
          onRetry={handleRetry}
        />
      ) : (
        <div className="flex-1">
          <EmptyState onCreate={ctx.createConversation} />
        </div>
      )}
      <ChatInput onSend={handleSend} disabled={isSending} />
    </div>
  );
}
```

**注意**：`handleRetry` 的注释标注了问题——本 Task 内我们用"直接重发"简化版,后续可改进为"只重发这一条"。这是 MVP 妥协,记入 plan 末尾的风险清单。

- [ ] **Step 2: 类型检查**

```bash
cd frontend
pnpm typecheck
```

**预期**：无错误。

- [ ] **Step 3: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/ChatWindow.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): add ChatWindow with mobile sheet and header"
```

---

## Task 18: App 组装

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 重写 `frontend/src/App.tsx`**

```tsx
import { ChatProvider, useChatContext } from "@/context/ChatContext";
import { ChatWindow } from "@/components/ChatWindow";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <ChatProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <div className="hidden md:block">
          <DesktopSidebar />
        </div>
        <main className="flex-1">
          <ChatWindow />
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </ChatProvider>
  );
}

function DesktopSidebar() {
  const ctx = useChatContext();
  return (
    <Sidebar
      conversations={ctx.conversations}
      currentId={ctx.currentId}
      onSelect={ctx.selectConversation}
      onCreate={ctx.createConversation}
      onDelete={ctx.deleteConversation}
      onRename={ctx.renameConversation}
    />
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
cd frontend
pnpm typecheck
```

**预期**：无错误。

- [ ] **Step 3: 跑 dev server 烟雾测试**

```bash
cd frontend
pnpm dev &
sleep 3
curl -sf http://localhost:5173/ | head -20
kill %1
```

**预期**：HTML 200。

- [ ] **Step 4: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/App.tsx
git -c user.name=cooper -c user.email=cooper@local commit -m "feat(frontend): wire App with provider, sidebar, window, toaster"
```

---

## Task 19: ESLint 配置

**Files:**
- Create: `frontend/eslint.config.js`

- [ ] **Step 1: 安装 ESLint 依赖**

```bash
cd frontend
pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals
```

- [ ] **Step 2: 创建 `frontend/eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
```

- [ ] **Step 3: 跑 lint**

```bash
cd frontend
pnpm lint
```

**预期**：无错误(可能有 warning,先看输出再决定)。

- [ ] **Step 4: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/eslint.config.js frontend/package.json frontend/pnpm-lock.yaml
git -c user.name=cooper -c user.email=cooper@local commit -m "chore(frontend): add ESLint with react-hooks and react-refresh"
```

---

## Task 20: README 与最终验证

**Files:**
- Create: `frontend/README.md`
- Modify: `README.md` (项目根)

- [ ] **Step 1: 创建 `frontend/README.md`**

````markdown
# Agent Deploy Kit — Frontend

Vite + React + TypeScript 单页聊天前端,调用后端 `POST /api/chat`。

## 开发

```bash
# 1. 安装依赖
pnpm install

# 2. 启动后端(另一终端)
cd .. && source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000

# 3. 配置 API 地址(可选,默认 http://localhost:8000)
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
├── components/      # UI 组件(Sidebar / ChatWindow / ...)
├── context/         # ChatContext
├── hooks/           # useConversations / useChat
├── lib/             # api / storage / utils
├── test/            # Vitest setup
└── types.ts
```
````

- [ ] **Step 2: 在根 `README.md` 追加 "Run the frontend" 段**

读取当前 `README.md`(已读过):

```markdown
# agent-deploy-kit
🚀 智能体一键部署工具包 - 开发者只需专注 LangChain 智能体逻辑,框架自动封装 FastAPI 接口 + React 前端,实现开箱即用的对话界面。
```

修改为(在末尾追加):

```markdown
# agent-deploy-kit
🚀 智能体一键部署工具包 - 开发者只需专注 LangChain 智能体逻辑,框架自动封装 FastAPI 接口 + React 前端,实现开箱即用的对话界面。

## Run the frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local   # 可选,默认指向 http://localhost:8000
pnpm dev
# 打开 http://localhost:5173
```

后端启动方式见仓库根的 `CLAUDE.md`。
```

- [ ] **Step 3: 跑全套质量门**

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**预期**：四项全绿,`dist/` 目录生成。

- [ ] **Step 4: 端到端烟雾测试(可选,需后端在跑)**

```bash
# 终端 A
cd /home/cooper/githubProjects/agent-deploy-kit
source .venv/bin/activate
uvicorn backend.main:app --port 8000

# 终端 B
cd frontend
pnpm dev
# 浏览器打开 http://localhost:5173
# 输入"北京天气",看到 "It's always sunny in 北京!"
```

**预期**：对话正常收发。

- [ ] **Step 5: 提交**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/README.md README.md
git -c user.name=cooper -c user.email=cooper@local commit -m "docs(frontend): add frontend README and root run instructions"
```

---

## 自检清单(执行时核对)

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 全部通过(单元 + 组件)
- [ ] `pnpm lint` 无 error
- [ ] `pnpm build` 成功
- [ ] `pnpm dev` 能起,browser 看到空对话界面
- [ ] 浏览器端到端:`"北京天气"` → 收到回复,侧边栏出现新对话
- [ ] 浏览器端到端:刷新页面,对话历史保留
- [ ] 浏览器端到端:点击"删除"对话,localStorage 同步更新

## 已知遗留

1. **重试简化**：当前 `ChatWindow.handleRetry` 直接重发整条内容,但本地 UI 中已存在那条 error 消息 + 助手历史都会再次进入载荷,产生重复。重做策略:把 error 消息直接从 messages 中删除,再调 `send` 重发。**改进留作 follow-up,不在本计划范围。**
2. **后端非流式**:与 spec 对齐;后续如需流式,升级 `useChat` + `MessageBubble` 即可。
3. **localStorage 容量**:正常情况远低于 5 MB 上限。
