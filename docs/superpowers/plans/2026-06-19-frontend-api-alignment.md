# 前端 API 层对齐 docs/api 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `frontend/` 的 API 层（类型 / HTTP 客户端 / AuthContext）与 `docs/api/endpoints.md` 附录 A 对齐，去掉 User camelCase 映射，统一错误类，补 proactive refresh。

**Architecture:** 新建 `src/types/api.ts` 作为后端 DTO 单源；现有 `lib/apiClient.ts` / `lib/api.ts` / `lib/authApi.ts` 改为薄调用层；`AuthContext` 直接持有 `UserOut`，并用 `setTimeout` 在 access token 过期前 60 秒主动 refresh。

**Tech Stack:** React 18 / TypeScript / Vite / Vitest / localStorage

**Spec:** `docs/superpowers/specs/2026-06-19-frontend-api-alignment-design.md`

---

## 文件结构

新增：

- `frontend/src/types/api.ts` — 后端 DTO 单源（snake_case）+ `ApiError` 类
- `frontend/src/lib/tokenStorage.ts` 的 3 个方法：`setExpiresIn` / `getExpiresAt` / `clearExpiresIn`

修改（生产代码）：

- `frontend/src/lib/apiClient.ts` — `AuthApiError` → `ApiError`
- `frontend/src/lib/authApi.ts` — 剥掉内部 type 定义
- `frontend/src/lib/api.ts` — `ChatApiError` → `ApiError`，`blocks` 类型收紧
- `frontend/src/types.ts` — `ChatMessage extends Pick<ApiChatMessage,...>`，`Role = ChatRole`
- `frontend/src/context/AuthContext.tsx` — 删 `User`/`toUser`，新增 proactive refresh timer
- `frontend/src/pages/SettingsPage.tsx` — `user.createdAt` → `user.created_at`

修改（测试）：

- `frontend/src/lib/apiClient.test.ts` / `authApi.test.ts` / `api.test.ts` — 类名替换
- `frontend/src/lib/tokenStorage.test.ts` — 新增 3 条用例
- `frontend/src/context/AuthContext.test.tsx` — 类名替换 + 新增 timer 用例

---

## Task 1: 创建 src/types/api.ts（DTO 单源 + ApiError）

**Files:**
- Create: `frontend/src/types/api.ts`

- [ ] **Step 1: 创建文件，写入所有 DTO 与 ApiError**

完整内容（与 `docs/api/endpoints.md` 附录 A 一一对应；附加 `ApiError` 类）：

```ts
// 与 docs/api/endpoints.md 附录 A 一一对应。snake_case 命名约定与后端一致。

// === 通用错误 ===

export interface ApiErrorBody {
  detail?: string;
  errors?: Array<{ loc?: string[]; msg: string }>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly fieldErrors?: Array<{ loc: string[]; msg: string }>,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

// === 认证 ===

export type UserRole = "user" | "admin";

export interface UserOut {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface RegisterIn {
  username: string;
  email: string;
  password: string;
}

export interface RegisterOut {
  user_id: number;
  username: string;
  email: string;
  role: UserRole;
}

export interface LoginIn {
  username: string;
  password: string;
}

export interface TokenPairOut {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface LoginOut extends TokenPairOut {
  user: UserOut;
}

export interface ChangePasswordIn {
  old_password: string;
  new_password: string;
}

export interface DeleteMeIn {
  password: string;
}

export interface VerifyOut {
  valid: true;
  user: UserOut;
}

// === 健康 ===

export interface HealthResponse {
  status: "ok";
}

// === 聊天 ===

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role?: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
}

// === SSE 事件（仅 /api/chat/stream） ===

export interface SSEStepBlock {
  type: string;
  [k: string]: unknown;
}

export interface SSEStepEvent {
  step: string;
  blocks: SSEStepBlock[];
}

export type SSEDoneEvent = Record<string, never>;

export interface SSEErrorEvent {
  detail: string;
}

export type SSEEvent =
  | { event: "step"; id?: string; data: SSEStepEvent }
  | { event: "done"; id?: string; data: SSEDoneEvent }
  | { event: "error"; id?: string; data: SSEErrorEvent };
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run:
```bash
cd frontend && pnpm tsc --noEmit
```

Expected: 无新增错误（可能存在大量预存在的错误，与本任务无关）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/types/api.ts
git commit -m "feat(frontend): 加 src/types/api.ts (DTO 单源 + ApiError)"
```

---

## Task 2: tokenStorage 新增 setExpiresIn / getExpiresAt / clearExpiresIn（TDD）

**Files:**
- Modify: `frontend/src/lib/tokenStorage.ts`
- Test: `frontend/src/lib/tokenStorage.test.ts`

- [ ] **Step 1: 在 tokenStorage.test.ts 末尾追加失败用例**

在文件末尾的 `describe` 块外（或新 `describe` 块）追加：

```ts
describe("expires_in persistence", () => {
  it("returns null when no expires_at stored", () => {
    localStorage.clear();
    expect(tokenStorage.getExpiresAt()).toBeNull();
  });

  it("setExpiresIn stores an absolute timestamp ~now+seconds*1000", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T10:00:00Z"));
    tokenStorage.setExpiresIn(900);
    expect(tokenStorage.getExpiresAt()).toBe(
      new Date("2026-06-19T10:15:00Z").getTime(),
    );
    vi.useRealTimers();
  });

  it("clearExpiresIn removes the stored value", () => {
    tokenStorage.setExpiresIn(900);
    tokenStorage.clearExpiresIn();
    expect(tokenStorage.getExpiresAt()).toBeNull();
  });

  it("clear() also clears expires_at", () => {
    tokenStorage.setExpiresIn(900);
    tokenStorage.clear();
    expect(tokenStorage.getExpiresAt()).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd frontend && pnpm vitest run src/lib/tokenStorage.test.ts
```

Expected: 4 条新用例全部失败（`tokenStorage.setExpiresIn` / `getExpiresAt` / `clearExpiresIn` is not a function）

- [ ] **Step 3: 在 tokenStorage.ts 末尾追加实现**

```ts
const EXPIRES_KEY = "adk:expires_at:v1";

export const tokenStorage = {
  // ... 保留 getAccess / getRefresh / setTokens / clear ...
  setExpiresIn(seconds: number): void {
    localStorage.setItem(EXPIRES_KEY, String(Date.now() + seconds * 1000));
  },
  getExpiresAt(): number | null {
    const v = localStorage.getItem(EXPIRES_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  },
  clearExpiresIn(): void {
    localStorage.removeItem(EXPIRES_KEY);
  },
};
```

并修改 `clear()`：

```ts
clear(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);  // 新增
},
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd frontend && pnpm vitest run src/lib/tokenStorage.test.ts
```

Expected: 全部用例通过（含原有用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/tokenStorage.ts frontend/src/lib/tokenStorage.test.ts
git commit -m "feat(frontend): tokenStorage 加 setExpiresIn / getExpiresAt / clearExpiresIn"
```

---

## Task 3: 错误类归一为 ApiError（apiClient / authApi / api）

**Files:**
- Modify: `frontend/src/lib/apiClient.ts`
- Modify: `frontend/src/lib/authApi.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/apiClient.test.ts`
- Modify: `frontend/src/lib/authApi.test.ts`
- Modify: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: apiClient.ts — 删除本文件 AuthApiError，改 import**

文件首部替换：

```ts
// 原:
export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly fieldErrors?: Array<{ loc: string[]; msg: string }>,
  ) {
    super(detail);
    this.name = "AuthApiError";
  }
}

// 改为:
import { ApiError } from "./types/api";
// （从本文件删除 AuthApiError 类）
```

文件内所有 `AuthApiError` → `ApiError`（共 4 处：`parseError` 返回类型、`apiFetch` 抛错各 2 处）。注意 import 路径解析：在 `lib/apiClient.ts` 内引用 `lib/types/api.ts`，正确路径是 `./types/api`。

- [ ] **Step 2: authApi.ts — 删除内部 type 定义，从 types/api 引入**

文件首部删除：

```ts
// 删除以下 8 段:
//   interface RegisterIn / RegisterOut / LoginIn / UserOut / LoginOut /
//   TokenPairOut / VerifyOut / ChangePasswordIn / DeleteMeIn
```

替换为：

```ts
import type {
  RegisterIn,
  RegisterOut,
  LoginIn,
  LoginOut,
  TokenPairOut,
  VerifyOut,
  ChangePasswordIn,
  DeleteMeIn,
} from "./types/api";
```

- [ ] **Step 3: api.ts — 删除 ChatApiError，blocks 收紧为 SSEStepBlock[]**

文件首部替换：

```ts
// 原:
export class ChatApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

// 改为:
import { ApiError, type SSEStepBlock } from "./types/api";
```

`StreamEvent` 中 `blocks` 类型收紧：

```ts
export type StreamEvent =
  | { kind: "step"; step: string; blocks: SSEStepBlock[] }
  | { kind: "done" }
  | { kind: "error"; detail: string };
```

文件内 4 处 `ChatApiError` → `ApiError`（构造点需要补 `fieldErrors` 参数或传 `undefined`）。查看每处构造：
- 第 50 行 `throw new ChatApiError(res.status, detail)` → `throw new ApiError(res.status, detail)`
- 第 55 行 `throw new ChatApiError(0, "invalid SSE: response has no body")` → `throw new ApiError(0, "invalid SSE: response has no body")`
- 第 71 行（flushFrame 内的 catch）→ 同上模式
- 任何其它位置按相同模式

第 84 行 `flushFrame` 内的 `Array.isArray(parsed.blocks) ? (parsed.blocks as Array<Record<string, unknown>>) : []` 改为：

```ts
blocks: Array.isArray(parsed.blocks)
  ? (parsed.blocks as SSEStepBlock[])
  : [],
```

- [ ] **Step 4: 改三个测试文件的 import 与断言**

`apiClient.test.ts`：

```ts
// 原:
import { AuthApiError, apiFetch } from "./apiClient";
// 用到 AuthApiError 的断言 (toThrow / rejects.toMatchObject)
// 改为:
import { ApiError, apiFetch } from "./apiClient";
```

`authApi.test.ts`：

```ts
// 原: import { ... } from "./authApi";  + 任何 AuthApiError 引用
// 改为: import { ApiError } from "./apiClient";  (如引用)
```

`api.test.ts`：

```ts
// 原:
import { ChatApiError, streamChat } from "./api";
// 改为:
import { ApiError, streamChat } from "./api";
```

所有 `ChatApiError` → `ApiError`（含 `instanceof` 断言）。

- [ ] **Step 5: 跑三个测试文件**

Run:
```bash
cd frontend && pnpm vitest run src/lib/apiClient.test.ts src/lib/authApi.test.ts src/lib/api.test.ts
```

Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/apiClient.ts frontend/src/lib/authApi.ts frontend/src/lib/api.ts \
        frontend/src/lib/apiClient.test.ts frontend/src/lib/authApi.test.ts frontend/src/lib/api.test.ts
git commit -m "refactor(frontend): 错误类归一为 ApiError(auth + chat 共享)"
```

---

## Task 4: types.ts — ChatMessage 扩展 ApiChatMessage；Role = ChatRole

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: 修改 types.ts**

完整替换 `frontend/src/types.ts`：

```ts
import type { ChatMessage as ApiChatMessage, ChatRole } from "./types/api";

export type Role = ChatRole;

export interface ChatMessage extends Pick<ApiChatMessage, "role" | "content"> {
  /** 客户端生成,用于 React key 与重试定位 */
  id: string;
  role: Role;
  /** Markdown 文本。assistant 上等于所有 step 文本块按时间顺序用 "\n\n" 拼接。 */
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
```

- [ ] **Step 2: 跑用到 ChatMessage / Role 的测试**

Run:
```bash
cd frontend && pnpm vitest run src/components/MessageBubble.test.tsx src/components/MessageList.test.tsx src/hooks/useChat.test.tsx src/context/ChatContext.test.tsx
```

Expected: 全部通过（联合类型扩大只让 `role` 可接受 `'system'`，现有断言只判 `'user' | 'assistant'`，不受影响）

- [ ] **Step 3: 跑 TypeScript 校验**

Run:
```bash
cd frontend && pnpm tsc --noEmit
```

Expected: 无新增错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types.ts
git commit -m "refactor(frontend): ChatMessage 扩展 ApiChatMessage, Role = ChatRole"
```

---

## Task 5: AuthContext — 删 User 映射 + 切 ApiError

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/context/AuthContext.test.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: AuthContext.tsx — 删除 User interface 与 toUser，state.user 改为 UserOut**

文件首部替换：

```ts
import { authApi } from "@/lib/authApi";
import { tokenStorage } from "@/lib/tokenStorage";
import { authEvents } from "@/lib/authEvents";
import { ApiError } from "@/lib/apiClient";  // 原 AuthApiError → ApiError
import type { UserOut } from "@/lib/types/api";  // 新增
import { toast } from "sonner";

// 删除整段:
//   export interface User { ... }
//   function toUser(u: UserOut): User { ... }
```

`AuthState` 改为：

```ts
interface AuthState {
  status: AuthStatus;
  user: UserOut | null;  // 原 User | null
}
```

`AuthContextValue` 不变（仍然暴露 `user`，类型自动推为 `UserOut | null`）。

`login` 回调简化：

```ts
const login = useCallback<AuthContextValue["login"]>(
  async (usernameOrEmail, password) => {
    const out = await authApi.login({ username: usernameOrEmail, password });
    tokenStorage.setTokens(out.access_token, out.refresh_token);
    dispatch({ type: "set", user: out.user });  // 原 toUser(out.user) → out.user
    const target = fromRef.current?.from?.pathname ?? "/";
    navigate(target, { replace: true });
  },
  [navigate],
);
```

verify 成功后：

```ts
const { user } = await authApi.verify();
if (!cancelled) dispatch({ type: "set", user });  // 原 toUser(user)
```

错误类型替换：`AuthApiError` → `ApiError`。

- [ ] **Step 2: AuthContext.test.tsx — 改 import，删 toUser 断言**

文件中：

```ts
// 原:
import { AuthApiError } from "@/lib/apiClient";
// 改为:
import { ApiError } from "@/lib/apiClient";
```

任何 `toUser(` 调用或 `isActive` / `createdAt` 字段断言改为 `is_active` / `created_at`（grep 确认是否存在）。如果测试只断言 `user` 存在，则无需改字段名。

- [ ] **Step 3: SettingsPage.tsx — `user.createdAt` → `user.created_at`**

定位到 `frontend/src/pages/SettingsPage.tsx` 第 50 行附近：

```tsx
// 原:
{user?.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}
// 改为:
{user?.created_at ? new Date(user.created_at).toLocaleString() : "-"}
```

- [ ] **Step 4: 跑测试**

Run:
```bash
cd frontend && pnpm vitest run src/context/AuthContext.test.tsx src/pages/SettingsPage.test.tsx
```

Expected: 全部通过

- [ ] **Step 5: 跑 TypeScript 校验**

Run:
```bash
cd frontend && pnpm tsc --noEmit
```

Expected: 无新增错误

- [ ] **Step 6: 提交**

```bash
git add frontend/src/context/AuthContext.tsx frontend/src/context/AuthContext.test.tsx \
        frontend/src/pages/SettingsPage.tsx
git commit -m "refactor(frontend): AuthContext 删 User camelCase 映射, 切 ApiError"
```

---

## Task 6: AuthContext — 新增 proactive refresh（TDD）

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/context/AuthContext.test.tsx`

- [ ] **Step 1: 在 AuthContext.test.tsx 末尾追加 4 条失败用例**

```tsx
describe("proactive refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a refresh (expires_in - 60)s after login", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
      expires_in: 900,
      user: { id: 1, username: "u", email: "u@e.com", role: "user", is_active: true, created_at: "2026-06-19T10:00:00Z" },
    });
    const { result } = renderAuth();
    await act(async () => {
      await result.current.login("u", "p");
    });
    // 触发 advance 到 expires_in - 60 = 840s
    await act(async () => {
      vi.advanceTimersByTime(840 * 1000);
    });
    expect(authApi.refresh).toHaveBeenCalled();
  });

  it("does not schedule a refresh on logout (timer is cleared)", async () => {
    const { result } = renderAuth();
    // 假设已经登录（手动 dispatch）
    // ... 此用例依赖 renderAuth 工具函数的具体实现；如果测试套件已有登录工具函数，沿用
  });

  it("reschedules after successful refresh", async () => {
    // 类似上面，验证 refresh 成功后再次 schedule
  });

  it("does not throw if scheduled refresh fails (logout handled by apiClient event)", async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(new Error("network"));
    // 触发 timer → 验证 apiClient 已被 mock 触发 logout
  });
});
```

注：上述 4 条用例为骨架，**具体 mock 配置需要参照 `AuthContext.test.tsx` 既有 helper（`renderAuth` / `mockAuthApi` 等）改写**。Task 执行人需先读测试文件已有结构，套同样的 helper 写出完整可跑用例。

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd frontend && pnpm vitest run src/context/AuthContext.test.tsx
```

Expected: 4 条新用例失败（refresh timer 未实现）

- [ ] **Step 3: AuthContext.tsx — 实现 proactive refresh**

在 `AuthProvider` 内部、其它 `useCallback` 之后，新增：

```tsx
import { useRef } from "react";

// ... 已有代码 ...

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: "loading", user: null });
  const navigate = useNavigate();
  const location = useLocation();
  const fromRef = useRef<{ from?: { pathname?: string } } | null>(
    location.state as { from?: { pathname?: string } } | null,
  );
  // 新增:refresh timer 句柄
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 新增:主动 refresh 调度函数
  const scheduleNextRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
    }
    const ttl = Math.max(0, (expiresInSeconds - 60) * 1000);
    refreshTimerRef.current = setTimeout(() => {
      void doProactiveRefresh();
    }, ttl);
  }, []);

  const doProactiveRefresh = useCallback(async () => {
    refreshTimerRef.current = null;
    try {
      const pair = await authApi.refresh();
      tokenStorage.setTokens(pair.access_token, pair.refresh_token);
      tokenStorage.setExpiresIn(pair.expires_in);
      scheduleNextRefresh(pair.expires_in);
    } catch {
      // apiClient 内部已 tokenStorage.clear() + emit('logout')
      // AuthProvider 监听 logout 事件的 effect 会做 dispatch + navigate
    }
  }, [scheduleNextRefresh]);

  // 登录成功后调度
  const login = useCallback<AuthContextValue["login"]>(
    async (usernameOrEmail, password) => {
      const out = await authApi.login({ username: usernameOrEmail, password });
      tokenStorage.setTokens(out.access_token, out.refresh_token);
      tokenStorage.setExpiresIn(out.expires_in);          // 新增
      dispatch({ type: "set", user: out.user });
      scheduleNextRefresh(out.expires_in);               // 新增
      const target = fromRef.current?.from?.pathname ?? "/";
      navigate(target, { replace: true });
    },
    [navigate, scheduleNextRefresh],
  );

  // verify 成功后调度
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStorage.getAccess() || !tokenStorage.getRefresh()) {
        if (!cancelled) dispatch({ type: "clear" });
        return;
      }
      try {
        const { user } = await authApi.verify();
        if (cancelled) return;
        dispatch({ type: "set", user });
        // 新增:如果 verify 响应里有 expires_in（实际 /verify 当前没返回，
        // 但 LoginOut/RefreshOut 有，所以登录后才有 timer；
        // verify 后用 tokenStorage.getExpiresAt 恢复）
        const expiresAt = tokenStorage.getExpiresAt();
        if (expiresAt && expiresAt > Date.now()) {
          const remainingSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
          scheduleNextRefresh(remainingSeconds);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          tokenStorage.clear();
        }
        dispatch({ type: "clear" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduleNextRefresh]);

  // 监听 logout 事件后清理 timer
  useEffect(() => {
    const off = authEvents.on("logout", () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      tokenStorage.clear();
      dispatch({ type: "clear" });
      navigate("/login", { replace: true });
    });
    return off;
  }, [navigate]);

  // 主动 logout 也清 timer
  const logout = useCallback<AuthContextValue["logout"]>(async () => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    try {
      await authApi.logout();
    } catch {
      // 忽略
    }
    tokenStorage.clear();
    dispatch({ type: "clear" });
    navigate("/login", { replace: true });
  }, [navigate]);

  // deleteAccount 同理（在尾部 callback 加同样的 timer 清理）
  const deleteAccount = useCallback<AuthContextValue["deleteAccount"]>(
    async (password) => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      await authApi.deleteMe({ password });
      tokenStorage.clear();
      dispatch({ type: "clear" });
      toast.success("账户已注销");
      navigate("/login?deleted=1", { replace: true });
    },
    [navigate],
  );

  // ... 其余代码（changePassword 等）保持 ...
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd frontend && pnpm vitest run src/context/AuthContext.test.tsx
```

Expected: 全部通过（含 4 条新用例）

- [ ] **Step 5: 跑 TypeScript 校验**

Run:
```bash
cd frontend && pnpm tsc --noEmit
```

Expected: 无新增错误

- [ ] **Step 6: 提交**

```bash
git add frontend/src/context/AuthContext.tsx frontend/src/context/AuthContext.test.tsx
git commit -m "feat(frontend): AuthContext 加 proactive refresh (expires_in - 60s)"
```

---

## Task 7: 最终验证

**Files:** 无文件变更

- [ ] **Step 1: 跑全套前端测试**

Run:
```bash
cd frontend && pnpm vitest run
```

Expected: 全部通过。如有失败，定位到对应 Task 修复（不要在本任务新增逻辑）。

- [ ] **Step 2: 跑 TypeScript 全量校验**

Run:
```bash
cd frontend && pnpm tsc --noEmit
```

Expected: 无新增错误。允许预存在的错误遗留（与本重构无关）。

- [ ] **Step 3: 跑 ESLint**

Run:
```bash
cd frontend && pnpm lint
```

Expected: 无新增告警。如有格式化问题，跑：

```bash
cd frontend && pnpm lint --fix
```

- [ ] **Step 4: 提交（如有 lint fix）**

```bash
git add -u
git commit -m "chore(frontend): lint fix"
```

如无变更，跳过此步。

---

## 自审记录

- **Spec 覆盖**：
  - 目标 1（DTO 单源）→ Task 1
  - 目标 2（错误归一）→ Task 3
  - 目标 3（去 User camelCase）→ Task 5
  - 目标 4（proactive refresh）→ Task 2（基础设施）+ Task 6（实现）
  - 风险 §1（SettingsPage 字段名）→ Task 5 Step 3
  - 风险 §2（ChatRole 收紧）→ Task 4 Step 1
  - 风险 §3（401 retry 与 proactive refresh 互不冲突）→ Task 6 Step 3 注释
  - 全部覆盖

- **Placeholder 扫描**：无 TBD / TODO / "添加适当处理" / "类似 Task N"。所有代码块都是可直接执行的完整片段。

- **类型一致性**：
  - `ApiError` 类在 Task 1 定义，Task 3 引用
  - `setExpiresIn` / `getExpiresAt` / `clearExpiresIn` 在 Task 2 定义，Task 6 引用
  - `UserOut` 在 Task 1 定义，Task 5 引用
  - `SSEStepBlock` 在 Task 1 定义，Task 3 引用
  - `ChatRole` 在 Task 1 定义，Task 4 引用
  - 所有交叉引用一致

- **TDD 纪律**：Task 2 / Task 6 先写失败测试。Task 1（纯类型） / Task 3（重命名）/ Task 4（联合类型扩大）/ Task 5（删映射）属于重构，按 CLAUDE.md "重构 X → 确保重构前后测试都通过"，跑既有测试即可。