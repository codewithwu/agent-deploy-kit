# 前端 API 层对齐 docs/api

> 把 `frontend/` 的 API 层（类型 / HTTP 客户端 / AuthContext）与 `docs/api/endpoints.md` 附录 A 的 TypeScript 类型 + 鉴权约定对齐。
>
> 日期：2026-06-19
> 范围：仅前端。不修改后端，不修改 `docs/api/`。

## 目标

1. **类型单源**：把 endpoints.md 附录 A 整体复制到 `frontend/src/types/api.ts`，删除 `authApi.ts` 内的重复定义。
2. **错误归一**：`AuthApiError` + `ChatApiError` → 单一 `ApiError`。
3. **去掉 User camelCase 映射**：`AuthContext` 直接持有 `UserOut`，UI 组件读 `user.is_active` / `user.created_at`。
4. **补 proactive refresh**：登录 / verify / refresh 成功后，按 `(expires_in - 60) * 1000` 提前 setTimeout refresh。

## 架构

四层职责分离，依赖方向单向：

```
docs/api (契约)
    │
    ▼
src/types/api.ts          ← 后端 DTO 单源（snake_case，含 ApiError）
    │
    ▼
src/lib/apiClient.ts      ← 鉴权 fetch + 401 retry
src/lib/api.ts            ← SSE 流式 fetch
src/lib/authApi.ts        ← 类型化端点封装
    │
    ▼
src/types.ts              ← UI 模型（合并 API 字段 + 客户端字段）
    │
    ▼
src/context/*  src/components/*
```

## 改动清单

### 新建

- `src/types/api.ts`：从 endpoints.md 附录 A 整体复制 `UserOut` / `RegisterIn` / `RegisterOut` / `LoginIn` / `TokenPairOut` / `LoginOut` / `ChangePasswordIn` / `DeleteMeIn` / `VerifyOut` / `HealthResponse` / `UserRole` / `ChatRole` / `ChatMessage` / `ChatRequest` / `ChatResponse` / `SSEStepBlock` / `SSEStepEvent` / `SSEDoneEvent` / `SSEErrorEvent` / `SSEEvent`。
  - 同一文件追加 `ApiError` 类（`status` / `detail` / `fieldErrors`，字段名与 `errors[]` 同构：`Array<{ loc: string[]; msg: string }>`）。

### 修改

- `src/lib/apiClient.ts`：
  - 删除本文件内 `AuthApiError`，改为 `import { ApiError } from "./types/api"`。
  - `parseError` / `apiFetch` 行为不变；错误抛出由 `AuthApiError` 改为 `ApiError`。
  - 401 单例 refresh、`auth: 'access' | 'refresh' | 'none'` 三态、`buildInit` 全部保留。

- `src/lib/authApi.ts`：
  - 删除文件内 `RegisterIn` / `RegisterOut` / `LoginIn` / `UserOut` / `LoginOut` / `TokenPairOut` / `VerifyOut` / `ChangePasswordIn` / `DeleteMeIn` 类型定义。
  - 改为 `import type { RegisterIn, RegisterOut, LoginIn, LoginOut, TokenPairOut, VerifyOut, ChangePasswordIn, DeleteMeIn } from "./types/api"`。
  - `AuthApiError` → `ApiError`（如本文件有引用）。

- `src/lib/api.ts`：
  - `ChatApiError` → 删除；改为 `import { ApiError } from "./types/api"`。
  - `streamChat` 签名不变（`AsyncGenerator<StreamEvent>`）。
  - `StreamEvent` 形状保留（`kind: 'step' | 'done' | 'error'`），但 `step.blocks` 由 `Array<Record<string, unknown>>` 收紧为 `SSEStepBlock[]`。
  - 抛错时一律 `throw new ApiError(res.status, detail, body.errors)`。

- `src/types.ts`：
  - `ChatMessage` 改为 `extends Pick<ApiChatMessage, 'role' | 'content'>`，加客户端字段 `id` / `createdAt` / `pending?` / `error?`。
  - `Role = 'user' | 'assistant'` 收紧为 `import type { ChatRole } from './types/api'`，并 `export type Role = ChatRole` 保持向后兼容。
  - `Conversation` 不动。

- `src/context/AuthContext.tsx`：
  - 删除 `User` interface 与 `toUser` 函数。
  - `AuthState.user` 类型改为 `UserOut | null`。
  - `login` / `verify` / 后续 proactive refresh 成功后，`dispatch({ type: 'set', user: out.user })` 直接持有后端形状。
  - `AuthApiError` → `ApiError`。
  - 新增 proactive refresh（详见 §数据流）。
  - `authEvents` 监听逻辑、401 失败后的清理路径保留。

- `src/lib/tokenStorage.ts`：
  - 新增 `setExpiresIn(seconds: number)`：写 `localStorage['adk:expires_at:v1'] = Date.now() + seconds * 1000`。
  - 新增 `getExpiresAt(): number | null`：读 key，非空返回数值。
  - 新增 `clearExpiresIn()`：`removeItem('adk:expires_at:v1')`。
  - `clear()` 在原逻辑外追加 `clearExpiresIn()`。

- `src/pages/SettingsPage.tsx`：
  - `user?.createdAt` → `user?.created_at`。

- 测试文件：
  - `src/lib/apiClient.test.ts`：`AuthApiError` → `ApiError`（import 与断言）。
  - `src/lib/authApi.test.ts`：`AuthApiError` → `ApiError`。
  - `src/lib/api.test.ts`：`ChatApiError` → `ApiError`。
  - `src/context/AuthContext.test.tsx`：`AuthApiError` → `ApiError`；删 `toUser` 相关断言（若存在）；新增 proactive refresh 用例。
  - `src/lib/tokenStorage.test.ts`：新增 `setExpiresIn` / `getExpiresAt` / `clearExpiresIn` 用例。

## 数据流：proactive refresh

AuthContext 在三种入口成功后调度下一次 refresh：

```
登录 / verify / 主动 refresh 成功
    ↓
tokenStorage.setExpiresIn(expires_in)
    ↓
scheduleNextRefresh()：clearTimeout(oldTimer); timer = setTimeout(refresh, (expires_in - 60) * 1000)
    ↓
timer 触发 → authApi.refresh() 走 apiClient (auth='refresh')
    ↓
成功：setTokens + setExpiresIn + scheduleNextRefresh（递归）
失败：apiClient 抛 ApiError → AuthContext catch → clearTokens + clearExpiresIn + emit logout
```

约束：

- `apiClient` 的 401-retry 单例（`let refreshing = null`）与 AuthContext 的定时 refresh 互不冲突：定时 refresh 调 `apiFetch('/api/auth/refresh', { auth: 'refresh' })`，`apiFetch` 行 91 的 `if (res.status !== 401 || auth !== 'access')` 守门确保 `auth === 'refresh'` 不进入重试分支。
- 跨刷新页面：`AuthProvider` 挂载时若 `tokenStorage.getAccess()` 存在，verify 成功后从响应里的 `expires_in` 调度 timer；无需单独持久化 timer handle。
- effect cleanup：组件卸载 / `state.status` 变化（非 authenticated）时 `clearTimeout(timer)`。

清理路径：

- `logout`：`tokenStorage.clear()`（含 clearExpiresIn） + clearTimeout + dispatch clear + 跳 /login。
- `deleteAccount`：同上 + 跳 /login?deleted=1。
- refresh 失败：捕获 ApiError → 走现有 `authEvents.emit('logout')` 路径（apiClient 已实现），AuthContext 监听 `logout` 事件时已包含清理。

## 测试策略

新增 / 修改的测试：

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/lib/apiClient.test.ts` | 改名 | `AuthApiError` → `ApiError`，所有 401 / refresh / retry 单例用例保留 |
| `src/lib/authApi.test.ts` | 改名 | 类型已外移，断言不变 |
| `src/lib/api.test.ts` | 改名 | `ChatApiError` → `ApiError`，SSE 解析用例保留 |
| `src/lib/tokenStorage.test.ts` | 增 | `setExpiresIn` / `getExpiresAt` / `clearExpiresIn` 三条 |
| `src/context/AuthContext.test.tsx` | 增 | 用 `vi.useFakeTimers()` 验证：login 后调度 timer；timer 触发后调用 `authApi.refresh`；logout 时 clearTimeout |

不引入新依赖。

## 风险与边界

1. **User 字段名是 breaking**：`user.createdAt` → `user.created_at`。grep 确认 `SettingsPage.tsx:50` 是唯一改动点；`UserMenu.tsx` 只读 `username` / `email`，不动。
2. **ChatRole 收紧**：原 `Role = 'user' | 'assistant'` 改为含 `'system'` 的 `ChatRole`。前端从不发 `system` 消息，无实际影响；联合类型扩大不影响现有断言。
3. **proactive refresh 与现有 401 retry 的并发**：见 §数据流 第 1 条约束。
4. **不修改后端代码**（CLAUDE.md §2 "仅前端任务不要看后端代码"）。
5. **不修改 `docs/api/`**（CLAUDE.md §3 "前端不自己改 docs/api"）。如发现文档与实际不符，反馈给后端 owner。
6. **`expires_at` 持久化的精度**：秒级（`Date.now()` 毫秒级精度）。多个标签页同时登录时，各自调度 timer，会出现短暂并发 refresh；apiClient refresh 单例会复用第一次的 Promise。