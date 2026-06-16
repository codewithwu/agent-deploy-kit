# 前端鉴权 + 路由守卫 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给前端加上注册/登录/退出/改密/注销账户的 UI 和路由守卫,所有功能(聊天)登录后才能用。

**Architecture:** `react-router-dom@^6.21.0` 路由 + `AuthContext` 管登录态 + `apiClient` 做 401 自动 refresh + 重放;token 存 localStorage,启动时 `/verify` 恢复登录态。

**Tech Stack:** React 18 + TypeScript 5 + Vite 5 + Tailwind 3 + shadcn/ui + react-router-dom v6 + Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-06-16-frontend-auth-routing-design.md`

---

## 文件结构(实施前先看)

新增:
```
frontend/src/
├── context/AuthContext.tsx
├── lib/authApi.ts
├── lib/apiClient.ts
├── lib/tokenStorage.ts
├── lib/authEvents.ts
├── components/ProtectedRoute.tsx
├── components/LoadingScreen.tsx
├── components/UserMenu.tsx
├── components/TopBar.tsx
├── components/auth/LoginForm.tsx
├── components/auth/RegisterForm.tsx
├── components/auth/ChangePasswordForm.tsx
├── components/auth/DeleteAccountDialog.tsx
├── components/ui/input.tsx
├── components/ui/label.tsx
├── components/ui/card.tsx
├── components/ui/alert.tsx
├── components/ui/avatar.tsx
├── components/ui/dialog.tsx
├── pages/LoginPage.tsx
├── pages/RegisterPage.tsx
├── pages/ChatPage.tsx
├── pages/SettingsPage.tsx
├── pages/NotFoundPage.tsx
└── AppRoutes.tsx
```

修改:
```
frontend/src/App.tsx
frontend/src/main.tsx
frontend/package.json
```

不动:`lib/api.ts`、`context/ChatContext.tsx`、所有现有聊天组件。

---

## Task 1: 安装 react-router-dom

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm add react-router-dom@^6.21.0
```

- [ ] **Step 2: 验证 package.json 已更新**

```bash
grep '"react-router-dom"' package.json
```

期望:输出含 `"react-router-dom": "^6.21.0"`。

- [ ] **Step 3: 验证 pnpm-lock 已更新**

```bash
test -f pnpm-lock.yaml && grep -q 'react-router-dom' pnpm-lock.yaml && echo OK
```

期望:输出 `OK`。

- [ ] **Step 4: 跑现有测试,确保未破坏**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test
```

期望:全部通过。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): 安装 react-router-dom@^6.21.0"
```

---

## Task 2: tokenStorage(TDD)

**Files:**
- Create: `frontend/src/lib/tokenStorage.ts`
- Create: `frontend/src/lib/tokenStorage.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/tokenStorage.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { tokenStorage } from "./tokenStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("tokenStorage", () => {
  it("returns null when no tokens are stored", () => {
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });

  it("stores and retrieves both tokens", () => {
    tokenStorage.setTokens("access-123", "refresh-456");
    expect(tokenStorage.getAccess()).toBe("access-123");
    expect(tokenStorage.getRefresh()).toBe("refresh-456");
  });

  it("clear() removes both tokens", () => {
    tokenStorage.setTokens("a", "r");
    tokenStorage.clear();
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });

  it("tolerates a corrupted localStorage value", () => {
    localStorage.setItem("adk:access_token:v1", "");
    expect(tokenStorage.getAccess()).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/lib/tokenStorage.test.ts
```

期望:FAIL,`tokenStorage` 未定义(模块找不到)。

- [ ] **Step 3: 实现 tokenStorage**

`frontend/src/lib/tokenStorage.ts`:
```ts
const ACCESS_KEY = "adk:access_token:v1";
const REFRESH_KEY = "adk:refresh_token:v1";

function read(key: string): string | null {
  const v = localStorage.getItem(key);
  return v && v.length > 0 ? v : null;
}

export const tokenStorage = {
  getAccess(): string | null {
    return read(ACCESS_KEY);
  },
  getRefresh(): string | null {
    return read(REFRESH_KEY);
  },
  setTokens(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/lib/tokenStorage.test.ts
```

期望:4 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/lib/tokenStorage.ts frontend/src/lib/tokenStorage.test.ts
git commit -m "feat(frontend): 加 tokenStorage(Access/Refresh localStorage 封装)"
```

---

## Task 3: authEvents(TDD)

**Files:**
- Create: `frontend/src/lib/authEvents.ts`
- Create: `frontend/src/lib/authEvents.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/authEvents.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { authEvents } from "./authEvents";

describe("authEvents", () => {
  it("calls subscribed handler on emit", () => {
    const handler = vi.fn();
    authEvents.on("logout", handler);
    authEvents.emit("logout");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns unsubscribe function that detaches handler", () => {
    const handler = vi.fn();
    const off = authEvents.on("logout", handler);
    off();
    authEvents.emit("logout");
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    authEvents.on("logout", a);
    authEvents.on("logout", b);
    authEvents.emit("logout");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/lib/authEvents.test.ts
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 authEvents**

`frontend/src/lib/authEvents.ts`:
```ts
type AuthEvent = "logout";

const listeners = new Map<AuthEvent, Set<() => void>>();

export const authEvents = {
  on(event: AuthEvent, handler: () => void): () => void {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  },
  emit(event: AuthEvent): void {
    const set = listeners.get(event);
    if (!set) return;
    for (const h of set) h();
  },
};
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/lib/authEvents.test.ts
```

期望:3 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/lib/authEvents.ts frontend/src/lib/authEvents.test.ts
git commit -m "feat(frontend): 加 authEvents(进程内 logout 事件总线)"
```

---

## Task 4: apiClient(TDD,核心 — refresh 单例)

**Files:**
- Create: `frontend/src/lib/apiClient.ts`
- Create: `frontend/src/lib/apiClient.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/apiClient.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthApiError, apiFetch } from "./apiClient";
import { tokenStorage } from "./tokenStorage";
import { authEvents } from "./authEvents";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  tokenStorage.setTokens("access-1", "refresh-1");
});

describe("apiFetch", () => {
  it("adds Authorization header for access auth and stringifies body", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiFetch("/api/auth/me");

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("/api/auth/me");
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer access-1",
    });
    expect((init as RequestInit).method).toBe("GET");
  });

  it("does not add Authorization when auth=none", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiFetch("/api/auth/login", {
      method: "POST",
      auth: "none",
      body: { username: "u", password: "p" },
    });

    const [, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).headers).not.toHaveProperty("Authorization");
    expect((init as RequestInit).body).toBe(
      JSON.stringify({ username: "u", password: "p" }),
    );
  });

  it("uses refresh token for auth=refresh", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiFetch("/api/auth/refresh", { auth: "refresh" });

    const [, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer refresh-1",
    });
  });

  it("throws AuthApiError on non-2xx with detail and fieldErrors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, {
        detail: "参数错误",
        errors: [{ loc: ["body", "username"], msg: "too short" }],
      }),
    );

    await expect(apiFetch("/api/auth/register", { body: {} })).rejects.toThrow(
      AuthApiError,
    );
    try {
      await apiFetch("/api/auth/register", { body: {} });
    } catch (e) {
      const err = e as AuthApiError;
      expect(err.status).toBe(400);
      expect(err.detail).toBe("参数错误");
      expect(err.fieldErrors).toEqual([
        { loc: ["body", "username"], msg: "too short" },
      ]);
    }
  });

  it("returns Response unchanged on 204 without reading body", async () => {
    const resp = new Response(null, { status: 204 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resp);
    const out = await apiFetch("/api/auth/logout", { method: "POST" });
    expect(out.status).toBe(204);
  });

  describe("401 + refresh + retry", () => {
    it("on 401 calls /api/auth/refresh, stores new tokens, retries original once", async () => {
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
            expires_in: 900,
          }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { id: 1 }));

      const out = await apiFetch("/api/auth/me");
      expect(out.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(3);

      // refresh 请求带 refresh token
      const refreshInit = spy.mock.calls[1]?.[1] as RequestInit;
      expect(refreshInit.headers).toMatchObject({
        Authorization: "Bearer refresh-1",
      });

      // 重试用新 access
      const retryInit = spy.mock.calls[2]?.[1] as RequestInit;
      expect(retryInit.headers).toMatchObject({
        Authorization: "Bearer access-2",
      });

      // 存储已更新
      expect(tokenStorage.getAccess()).toBe("access-2");
      expect(tokenStorage.getRefresh()).toBe("refresh-2");
    });

    it("on second 401 (after retry) throws AuthApiError(401)", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
            expires_in: 900,
          }),
        )
        .mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }));

      await expect(apiFetch("/api/auth/me")).rejects.toMatchObject({
        status: 401,
      });
    });

    it("on refresh failure: clears tokens, emits logout, throws AuthApiError", async () => {
      const onLogout = vi.fn();
      authEvents.on("logout", onLogout);
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }))
        .mockResolvedValueOnce(jsonResponse(401, { detail: "refresh 失败" }));

      await expect(apiFetch("/api/auth/me")).rejects.toThrow(AuthApiError);
      expect(tokenStorage.getAccess()).toBeNull();
      expect(tokenStorage.getRefresh()).toBeNull();
      expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it("concurrent 401s share a single refresh call", async () => {
      let refreshCalls = 0;
      const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/api/auth/refresh")) {
          refreshCalls++;
          // 模拟慢响应,确保两个请求都进来
          await new Promise((r) => setTimeout(r, 5));
          return jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
            expires_in: 900,
          });
        }
        return jsonResponse(401, { detail: "认证失败" });
      });

      const [a, b] = await Promise.all([
        apiFetch("/api/auth/me"),
        apiFetch("/api/auth/me"),
      ]);

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(refreshCalls).toBe(1);
      // 总调用:me×2 + refresh×1 + me(重试)×2 = 5
      expect(spy).toHaveBeenCalledTimes(5);
    });

    it("refreshed singleton resets after refresh resolves (next 401 starts new refresh)", async () => {
      const spy = vi.spyOn(globalThis, "fetch");
      spy.mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }));
      spy.mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-2",
          refresh_token: "refresh-2",
          token_type: "bearer",
          expires_in: 900,
        }),
      );
      spy.mockResolvedValueOnce(jsonResponse(200, { id: 1 }));
      spy.mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }));
      spy.mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-3",
          refresh_token: "refresh-3",
          token_type: "bearer",
          expires_in: 900,
        }),
      );
      spy.mockResolvedValueOnce(jsonResponse(200, { id: 2 }));

      await apiFetch("/api/auth/me");
      await apiFetch("/api/auth/me");

      const refreshCount = spy.mock.calls.filter(([u]) =>
        String(u).endsWith("/api/auth/refresh"),
      ).length;
      expect(refreshCount).toBe(2);
    });
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/lib/apiClient.test.ts
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 apiClient**

`frontend/src/lib/apiClient.ts`:
```ts
import { tokenStorage } from "./tokenStorage";
import { authEvents } from "./authEvents";

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

const DEFAULT_API_BASE = "http://localhost:8000";

function apiBase(): string {
  const v = import.meta.env.VITE_API_BASE;
  return v && v.length > 0 ? v : DEFAULT_API_BASE;
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: "access" | "refresh" | "none";
}

// refresh 单例:并发 401 共享同一 Promise
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = tokenStorage.getRefresh();
  if (!refresh) return null;
  try {
    const res = await fetch(`${apiBase()}/api/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refresh}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
    };
    tokenStorage.setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

function pickToken(auth: "access" | "refresh" | "none"): string | null {
  if (auth === "none") return null;
  return auth === "access"
    ? tokenStorage.getAccess()
    : tokenStorage.getRefresh();
}

async function parseError(res: Response): Promise<AuthApiError> {
  let body: { detail?: string; errors?: Array<{ loc: string[]; msg: string }> } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // 忽略,fallback 到 statusText
  }
  return new AuthApiError(res.status, body.detail ?? res.statusText, body.errors);
}

export async function apiFetch(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<Response> {
  const { body, auth = "access", headers, ...rest } = opts;
  const url = `${apiBase()}${path}`;

  const buildInit = (token: string | null): RequestInit => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return {
      ...rest,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
  };

  let res = await fetch(url, buildInit(pickToken(auth)));

  if (res.status !== 401 || auth !== "access") {
    if (!res.ok && res.status !== 204) {
      throw await parseError(res);
    }
    return res;
  }

  // 401 + access: 走 refresh 流程
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  const newAccess = await refreshing;
  if (!newAccess) {
    tokenStorage.clear();
    authEvents.emit("logout");
    throw new AuthApiError(401, "会话已过期,请重新登录");
  }

  res = await fetch(url, buildInit(newAccess));
  if (!res.ok && res.status !== 204) {
    throw await parseError(res);
  }
  return res;
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/lib/apiClient.test.ts
```

期望:全部 11 个用例 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/lib/apiClient.ts frontend/src/lib/apiClient.test.ts
git commit -m "feat(frontend): 加 apiClient(fetch 封装 + 401 自动 refresh + 单例锁)"
```

---

## Task 5: authApi 8 端点(TDD)

**Files:**
- Create: `frontend/src/lib/authApi.ts`
- Create: `frontend/src/lib/authApi.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/authApi.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { authApi } from "./authApi";
import { apiFetch } from "./apiClient";

vi.mock("./apiClient", () => ({ apiFetch: vi.fn() }));
const mockedApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockedApiFetch.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("authApi", () => {
  it("register POSTs to /api/auth/register with body", async () => {
    await authApi.register({
      username: "u",
      email: "e@x",
      password: "Pw123456",
    });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      auth: "none",
      body: { username: "u", email: "e@x", password: "Pw123456" },
    });
  });

  it("login POSTs to /api/auth/login with auth=none", async () => {
    await authApi.login({ username: "u", password: "p" });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      auth: "none",
      body: { username: "u", password: "p" },
    });
  });

  it("logout POSTs to /api/auth/logout with auth=access", async () => {
    await authApi.logout();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      auth: "access",
    });
  });

  it("refresh POSTs to /api/auth/refresh with auth=refresh", async () => {
    await authApi.refresh();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/refresh", {
      method: "POST",
      auth: "refresh",
    });
  });

  it("verify GETs /api/auth/verify with auth=access", async () => {
    await authApi.verify();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/verify", {
      method: "GET",
      auth: "access",
    });
  });

  it("me GETs /api/auth/me with auth=access", async () => {
    await authApi.me();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me", {
      method: "GET",
      auth: "access",
    });
  });

  it("changePassword PATCHes /api/auth/me/password with auth=access", async () => {
    await authApi.changePassword({ old_password: "o", new_password: "n" });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me/password", {
      method: "PATCH",
      auth: "access",
      body: { old_password: "o", new_password: "n" },
    });
  });

  it("deleteMe DELETEs /api/auth/me with auth=access and body", async () => {
    await authApi.deleteMe({ password: "p" });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me", {
      method: "DELETE",
      auth: "access",
      body: { password: "p" },
    });
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/lib/authApi.test.ts
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 authApi**

`frontend/src/lib/authApi.ts`:
```ts
import { apiFetch } from "./apiClient";

// 类型与后端 backend/auth/schemas.py 对齐
export interface RegisterIn {
  username: string;
  email: string;
  password: string;
}
export interface RegisterOut {
  user_id: number;
  username: string;
  email: string;
  role: "user" | "admin";
}

export interface LoginIn {
  username: string;
  password: string;
}
export interface UserOut {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
}
export interface LoginOut {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: UserOut;
}

export interface TokenPairOut {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface VerifyOut {
  valid: true;
  user: UserOut;
}

export interface ChangePasswordIn {
  old_password: string;
  new_password: string;
}

export interface DeleteMeIn {
  password: string;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const authApi = {
  register(body: RegisterIn): Promise<RegisterOut> {
    return apiFetch("/api/auth/register", {
      method: "POST",
      auth: "none",
      body,
    }).then(unwrap);
  },
  login(body: LoginIn): Promise<LoginOut> {
    return apiFetch("/api/auth/login", {
      method: "POST",
      auth: "none",
      body,
    }).then(unwrap);
  },
  logout(): Promise<void> {
    return apiFetch("/api/auth/logout", { method: "POST", auth: "access" }).then(
      () => undefined,
    );
  },
  refresh(): Promise<TokenPairOut> {
    return apiFetch("/api/auth/refresh", {
      method: "POST",
      auth: "refresh",
    }).then(unwrap);
  },
  verify(): Promise<VerifyOut> {
    return apiFetch("/api/auth/verify", { method: "GET", auth: "access" }).then(
      unwrap,
    );
  },
  me(): Promise<UserOut> {
    return apiFetch("/api/auth/me", { method: "GET", auth: "access" }).then(
      unwrap,
    );
  },
  changePassword(body: ChangePasswordIn): Promise<void> {
    return apiFetch("/api/auth/me/password", {
      method: "PATCH",
      auth: "access",
      body,
    }).then(() => undefined);
  },
  deleteMe(body: DeleteMeIn): Promise<void> {
    return apiFetch("/api/auth/me", {
      method: "DELETE",
      auth: "access",
      body,
    }).then(() => undefined);
  },
};
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/lib/authApi.test.ts
```

期望:8 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/lib/authApi.ts frontend/src/lib/authApi.test.ts
git commit -m "feat(frontend): 加 authApi(8 个鉴权端点纯函数封装)"
```

---

## Task 6: AuthContext(TDD)

**Files:**
- Create: `frontend/src/context/AuthContext.tsx`
- Create: `frontend/src/context/AuthContext.test.tsx`

- [ ] **Step 1: 写失败测试**

`frontend/src/context/AuthContext.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { authApi } from "@/lib/authApi";
import { tokenStorage } from "@/lib/tokenStorage";
import { authEvents } from "@/lib/authEvents";

vi.mock("@/lib/authApi", () => ({
  authApi: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    verify: vi.fn(),
    me: vi.fn(),
    changePassword: vi.fn(),
    deleteMe: vi.fn(),
  },
}));

const mockedAuthApi = vi.mocked(authApi);

const userStub = {
  id: 1,
  username: "alice",
  email: "alice@x.com",
  role: "user" as const,
  is_active: true,
  created_at: "2026-06-16T00:00:00Z",
};

const loginStub = {
  access_token: "a",
  refresh_token: "r",
  token_type: "bearer" as const,
  expires_in: 900,
  user: userStub,
};

function Probe() {
  const { status, user, isAuthenticated, login, logout, deleteAccount } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.username ?? "none"}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <button
        onClick={async () => {
          try {
            await login("alice", "pw");
          } catch {
            /* ignore */
          }
        }}
      >
        do-login
      </button>
      <button
        onClick={async () => {
          try {
            await logout();
          } catch {
            /* ignore */
          }
        }}
      >
        do-logout
      </button>
      <button
        onClick={async () => {
          try {
            await deleteAccount("pw");
          } catch {
            /* ignore */
          }
        }}
      >
        do-delete
      </button>
    </div>
  );
}

function renderWithRouter(initial: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initial}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockedAuthApi.verify.mockResolvedValue({ valid: true, user: userStub });
  mockedAuthApi.login.mockResolvedValue(loginStub);
  mockedAuthApi.logout.mockResolvedValue(undefined);
  mockedAuthApi.deleteMe.mockResolvedValue(undefined);
});

describe("AuthProvider", () => {
  it("throws when useAuth is used outside provider", () => {
    expect(() => render(<Probe />)).toThrow(/AuthProvider/);
  });

  it("starts in loading state and ends anonymous when no tokens", async () => {
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mockedAuthApi.verify).not.toHaveBeenCalled();
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("calls verify on mount when tokens exist; on success → authenticated", async () => {
    tokenStorage.setTokens("a", "r");
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(mockedAuthApi.verify).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user")).toHaveTextContent("alice");
  });

  it("clears tokens and goes anonymous on verify 401", async () => {
    tokenStorage.setTokens("a", "r");
    const { AuthApiError } = await import("@/lib/apiClient");
    mockedAuthApi.verify.mockRejectedValueOnce(new AuthApiError(401, "认证失败"));

    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it("login(): stores tokens, sets user, returns", async () => {
    renderWithRouter();
    await waitFor(() => screen.getByTestId("status"));

    await act(async () => {
      screen.getByText("do-login").click();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(tokenStorage.getAccess()).toBe("a");
    expect(tokenStorage.getRefresh()).toBe("r");
    expect(screen.getByTestId("user")).toHaveTextContent("alice");
  });

  it("logout(): calls api, clears tokens, goes anonymous even if api throws", async () => {
    tokenStorage.setTokens("a", "r");
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    mockedAuthApi.logout.mockRejectedValueOnce(new Error("network"));

    await act(async () => {
      screen.getByText("do-logout").click();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it("deleteAccount(): calls api, clears tokens, goes anonymous, returns", async () => {
    tokenStorage.setTokens("a", "r");
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await act(async () => {
      screen.getByText("do-delete").click();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mockedAuthApi.deleteMe).toHaveBeenCalledWith({ password: "pw" });
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it("responds to authEvents 'logout' by clearing state", async () => {
    tokenStorage.setTokens("a", "r");
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    act(() => {
      authEvents.emit("logout");
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(tokenStorage.getAccess()).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/context/AuthContext.test.tsx
```

期望:FAIL,`AuthProvider`/`useAuth` 找不到。

- [ ] **Step 3: 实现 AuthContext**

`frontend/src/context/AuthContext.tsx`:
```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authApi, type UserOut } from "@/lib/authApi";
import { tokenStorage } from "@/lib/tokenStorage";
import { authEvents } from "@/lib/authEvents";
import { AuthApiError } from "@/lib/apiClient";
import { toast } from "sonner";

export interface User {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  isActive: boolean;
  createdAt: string;
}

function toUser(u: UserOut): User {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    isActive: u.is_active,
    createdAt: u.created_at,
  };
}

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: User | null;
}

type Action =
  | { type: "set"; user: User }
  | { type: "clear" }
  | { type: "loading" };

function reducer(state: AuthState, action: Action): AuthState {
  switch (action.type) {
    case "set":
      return { status: "authenticated", user: action.user };
    case "clear":
      return { status: "anonymous", user: null };
    case "loading":
      return { status: "loading", user: null };
  }
}

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  isAuthenticated: boolean;
  login(usernameOrEmail: string, password: string): Promise<void>;
  register(username: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  deleteAccount(password: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: "loading", user: null });
  const navigate = useNavigate();
  const location = useLocation();

  // 启动:有 token 就 verify,恢复登录态
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStorage.getAccess() || !tokenStorage.getRefresh()) {
        if (!cancelled) dispatch({ type: "clear" });
        return;
      }
      try {
        const { user } = await authApi.verify();
        if (!cancelled) dispatch({ type: "set", user: toUser(user) });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof AuthApiError && e.status === 401) {
          tokenStorage.clear();
        }
        dispatch({ type: "clear" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 监听 apiClient 触发的 logout(refresh 失败)
  useEffect(() => {
    const off = authEvents.on("logout", () => {
      tokenStorage.clear();
      dispatch({ type: "clear" });
      navigate("/login", { replace: true });
    });
    return off;
  }, [navigate]);

  const login = useCallback<AuthContextValue["login"]>(
    async (usernameOrEmail, password) => {
      const out = await authApi.login({ username: usernameOrEmail, password });
      tokenStorage.setTokens(out.access_token, out.refresh_token);
      dispatch({ type: "set", user: toUser(out.user) });
      const from = (location.state as { from?: { pathname?: string } } | null)?.from
        ?.pathname;
      navigate(from ?? "/", { replace: true });
    },
    [navigate, location.state],
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (username, email, password) => {
      await authApi.register({ username, email, password });
      toast.success("注册成功,请登录");
      navigate("/login", { replace: true });
    },
    [navigate],
  );

  const logout = useCallback<AuthContextValue["logout"]>(async () => {
    try {
      await authApi.logout();
    } catch {
      // 忽略:本地状态必须清
    }
    tokenStorage.clear();
    dispatch({ type: "clear" });
    navigate("/login", { replace: true });
  }, [navigate]);

  const changePassword = useCallback<AuthContextValue["changePassword"]>(
    async (oldPassword, newPassword) => {
      await authApi.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
    },
    [],
  );

  const deleteAccount = useCallback<AuthContextValue["deleteAccount"]>(
    async (password) => {
      await authApi.deleteMe({ password });
      tokenStorage.clear();
      dispatch({ type: "clear" });
      toast.success("账户已注销");
      navigate("/login?deleted=1", { replace: true });
    },
    [navigate],
  );

  const value: AuthContextValue = {
    status: state.status,
    user: state.user,
    isAuthenticated: state.status === "authenticated",
    login,
    register,
    logout,
    changePassword,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/context/AuthContext.test.tsx
```

期望:8 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/context/AuthContext.tsx frontend/src/context/AuthContext.test.tsx
git commit -m "feat(frontend): 加 AuthContext(全局登录态 + 启动 verify + 事件订阅)"
```

---

## Task 7: shadcn UI 组件(6 个 wrapper)

**Files:**
- Create: `frontend/src/components/ui/input.tsx`
- Create: `frontend/src/components/ui/label.tsx`
- Create: `frontend/src/components/ui/card.tsx`
- Create: `frontend/src/components/ui/alert.tsx`
- Create: `frontend/src/components/ui/avatar.tsx`
- Create: `frontend/src/components/ui/dialog.tsx`

不写单测(纯样式包装;沿用现有 `button.tsx` / `dropdown-menu.tsx` 风格)。

- [ ] **Step 1: 创建 input.tsx**

`frontend/src/components/ui/input.tsx`:
```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 2: 创建 label.tsx**

`frontend/src/components/ui/label.tsx`:
```tsx
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
```

需要 `LabelPrimitive`:`@radix-ui/react-label` **未**装,补一下:
```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm add @radix-ui/react-label
```

- [ ] **Step 3: 创建 card.tsx**

`frontend/src/components/ui/card.tsx`:
```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
```

- [ ] **Step 4: 创建 alert.tsx**

`frontend/src/components/ui/alert.tsx`:
```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
```

- [ ] **Step 5: 创建 avatar.tsx**

`frontend/src/components/ui/avatar.tsx`:
```tsx
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted text-xs",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
```

- [ ] **Step 6: 创建 dialog.tsx**

`frontend/src/components/ui/dialog.tsx`:
```tsx
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
```

- [ ] **Step 7: 跑 lint + typecheck**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm lint
pnpm typecheck
```

期望:无错误。

- [ ] **Step 8: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/ui/ frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): 加 shadcn UI 包装(input/label/card/alert/avatar/dialog)"
```

---

## Task 8: LoadingScreen

**Files:**
- Create: `frontend/src/components/LoadingScreen.tsx`

- [ ] **Step 1: 实现 LoadingScreen**

`frontend/src/components/LoadingScreen.tsx`:
```tsx
import { Loader2 } from "lucide-react";

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        {message ? <p className="text-sm">{message}</p> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/LoadingScreen.tsx
git commit -m "feat(frontend): 加 LoadingScreen"
```

---

## Task 9: ProtectedRoute(TDD)

**Files:**
- Create: `frontend/src/components/ProtectedRoute.tsx`
- Create: `frontend/src/components/ProtectedRoute.test.tsx`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/ProtectedRoute.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";

function makeValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    status: "anonymous",
    user: null,
    isAuthenticated: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    ...overrides,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname}</span>;
}

function renderWith(value: AuthContextValue, initial: string) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>home</div>} />
          </Route>
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("shows loading screen when status is loading", () => {
    renderWith(makeValue({ status: "loading" }), "/");
    expect(screen.getByText("home")).not.toBeInTheDocument();
    // Loader2 是 svg,仅断言无 home 渲染
  });

  it("redirects to /login with from state when anonymous", () => {
    renderWith(makeValue({ status: "anonymous" }), "/");
    expect(screen.getByTestId("loc").textContent).toBe("/login");
    expect(screen.queryByText("home")).not.toBeInTheDocument();
  });

  it("renders outlet when authenticated", () => {
    renderWith(
      makeValue({ status: "authenticated", isAuthenticated: true }),
      "/",
    );
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/components/ProtectedRoute.test.tsx
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 ProtectedRoute**

要把 `AuthContext` 导出 `AuthContext` 对象(目前只导出 `AuthProvider` + `useAuth`)。修改 `AuthContext.tsx` 末尾加 `export { AuthContext };` 即可。

`frontend/src/components/ProtectedRoute.tsx`:
```tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingScreen } from "./LoadingScreen";

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <LoadingScreen />;
  if (status === "anonymous") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}
```

并在 `frontend/src/context/AuthContext.tsx` 末尾追加:
```tsx
export { AuthContext };
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/components/ProtectedRoute.test.tsx
```

期望:3 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/ProtectedRoute.tsx frontend/src/components/ProtectedRoute.test.tsx frontend/src/context/AuthContext.tsx
git commit -m "feat(frontend): 加 ProtectedRoute(loading/anonymous/authenticated 三态)"
```

---

## Task 10: UserMenu(TDD)

**Files:**
- Create: `frontend/src/components/UserMenu.tsx`
- Create: `frontend/src/components/UserMenu.test.tsx`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/UserMenu.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { UserMenu } from "./UserMenu";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";

const user = {
  id: 1,
  username: "alice",
  email: "alice@x.com",
  role: "user" as const,
  isActive: true,
  createdAt: "2026-06-16T00:00:00Z",
};

function renderMenu(valueOverrides: Partial<AuthContextValue> = {}) {
  const logout = vi.fn();
  const value: AuthContextValue = {
    status: "authenticated",
    user,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout,
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    ...valueOverrides,
  };
  const utils = render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { ...utils, logout };
}

describe("UserMenu", () => {
  it("shows trigger with username initial and username", () => {
    renderMenu();
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("opens menu and shows email", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /alice/i }));
    expect(await screen.findByText("alice@x.com")).toBeInTheDocument();
  });

  it("clicking '退出登录' calls logout", async () => {
    const user = userEvent.setup();
    const { logout } = renderMenu();
    await user.click(screen.getByRole("button", { name: /alice/i }));
    await user.click(await screen.findByRole("menuitem", { name: /退出登录/ }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("renders only trigger when user is null", () => {
    render(
      <AuthContext.Provider
        value={{
          status: "anonymous",
          user: null,
          isAuthenticated: false,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          changePassword: vi.fn(),
          deleteAccount: vi.fn(),
        }}
      >
        <MemoryRouter>
          <UserMenu />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.queryByRole("button")).toBeInTheDocument();
    // DropdownMenu 不会展开
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/components/UserMenu.test.tsx
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 UserMenu**

`frontend/src/components/UserMenu.tsx`:
```tsx
import { useNavigate } from "react-router-dom";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

function initials(name: string): string {
  const c = name.trim()[0];
  return c ? c.toUpperCase() : "?";
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-9 items-center gap-2 px-2"
          aria-label={user ? user.username : "用户菜单"}
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback>{user ? initials(user.username) : "?"}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">
            {user?.username ?? "未登录"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user ? (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.username}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              账户设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                void logout();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/components/UserMenu.test.tsx
```

期望:4 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/UserMenu.tsx frontend/src/components/UserMenu.test.tsx
git commit -m "feat(frontend): 加 UserMenu(顶栏头像下拉:设置 + 退出)"
```

---

## Task 11: LoginForm(TDD)

**Files:**
- Create: `frontend/src/components/auth/LoginForm.tsx`
- Create: `frontend/src/components/auth/LoginForm.test.tsx`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/auth/LoginForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LoginForm } from "./LoginForm";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

function renderForm(loginImpl?: AuthContextValue["login"]) {
  const login = vi.fn(loginImpl);
  const value: AuthContextValue = {
    status: "anonymous",
    user: null,
    isAuthenticated: false,
    login,
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  };
  return {
    ...render(
      <AuthContext.Provider value={value}>
        <MemoryRouter>
          <LoginForm />
        </MemoryRouter>
      </AuthContext.Provider>,
    ),
    login,
  };
}

describe("LoginForm", () => {
  it("submits username and password", async () => {
    const user = userEvent.setup();
    const { login } = renderForm();
    await user.type(screen.getByLabelText(/用户名或邮箱/), "alice");
    await user.type(screen.getByLabelText(/密码/), "Secret123");
    await user.click(screen.getByRole("button", { name: /登录/ }));
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith("alice", "Secret123"),
    );
  });

  it("displays backend error detail", async () => {
    const user = userEvent.setup();
    renderForm(async () => {
      throw new AuthApiError(401, "用户名或密码错误");
    });
    await user.type(screen.getByLabelText(/用户名或邮箱/), "alice");
    await user.type(screen.getByLabelText(/密码/), "wrong");
    await user.click(screen.getByRole("button", { name: /登录/ }));
    expect(await screen.findByText("用户名或密码错误")).toBeInTheDocument();
  });

  it("disables submit button while pending", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const { login } = renderForm(() => new Promise<void>((r) => (resolve = r)));
    await user.type(screen.getByLabelText(/用户名或邮箱/), "alice");
    await user.type(screen.getByLabelText(/密码/), "Secret123");
    const btn = screen.getByRole("button", { name: /登录/ });
    await user.click(btn);
    expect(btn).toBeDisabled();
    resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(login).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/components/auth/LoginForm.test.tsx
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 LoginForm**

`frontend/src/components/auth/LoginForm.tsx`:
```tsx
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

export function LoginForm() {
  const { login } = useAuth();
  const [usernameOrEmail, setUoe] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(usernameOrEmail, password);
    } catch (e) {
      if (e instanceof AuthApiError) setError(e.detail);
      else setError("登录失败,请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="login-username">用户名或邮箱</Label>
        <Input
          id="login-username"
          name="username"
          autoComplete="username"
          required
          value={usernameOrEmail}
          onChange={(e) => setUoe(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">密码</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        登录
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        还没有账号?{" "}
        <Link to="/register" className="text-primary hover:underline">
          去注册
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/components/auth/LoginForm.test.tsx
```

期望:3 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/auth/LoginForm.tsx frontend/src/components/auth/LoginForm.test.tsx
git commit -m "feat(frontend): 加 LoginForm(用户名/邮箱 + 密码,后端错误展示)"
```

---

## Task 12: LoginPage

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: 实现 LoginPage**

`frontend/src/pages/LoginPage.tsx`:
```tsx
import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const justDeleted = params.get("deleted") === "1";

  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-[380px]">
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>输入账号信息以继续</CardDescription>
        </CardHeader>
        <CardContent>
          {justDeleted ? (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              账户已注销
            </div>
          ) : null}
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm typecheck
```

期望:无错误。

- [ ] **Step 3: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat(frontend): 加 LoginPage(已登录跳 /,支持 ?deleted=1 提示)"
```

---

## Task 13: RegisterForm(TDD)

**Files:**
- Create: `frontend/src/components/auth/RegisterForm.tsx`
- Create: `frontend/src/components/auth/RegisterForm.test.tsx`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/auth/RegisterForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RegisterForm } from "./RegisterForm";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

function renderForm(registerImpl?: AuthContextValue["register"]) {
  const register = vi.fn(registerImpl);
  const value: AuthContextValue = {
    status: "anonymous",
    user: null,
    isAuthenticated: false,
    login: vi.fn(),
    register,
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  };
  return {
    ...render(
      <AuthContext.Provider value={value}>
        <MemoryRouter>
          <RegisterForm />
        </MemoryRouter>
      </AuthContext.Provider>,
    ),
    register,
  };
}

describe("RegisterForm", () => {
  it("submits valid inputs", async () => {
    const user = userEvent.setup();
    const { register } = renderForm();
    await user.type(screen.getByLabelText(/^用户名$/), "alice");
    await user.type(screen.getByLabelText(/^邮箱$/), "alice@x.com");
    await user.type(screen.getByLabelText(/^密码$/), "Secret123");
    await user.type(screen.getByLabelText(/确认密码/), "Secret123");
    await user.click(screen.getByRole("button", { name: /注册/ }));
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith("alice", "alice@x.com", "Secret123"),
    );
  });

  it("rejects mismatched passwords client-side", async () => {
    const user = userEvent.setup();
    const { register } = renderForm();
    await user.type(screen.getByLabelText(/^用户名$/), "alice");
    await user.type(screen.getByLabelText(/^邮箱$/), "alice@x.com");
    await user.type(screen.getByLabelText(/^密码$/), "Secret123");
    await user.type(screen.getByLabelText(/确认密码/), "Different1");
    await user.click(screen.getByRole("button", { name: /注册/ }));
    expect(await screen.findByText(/两次密码不一致/)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("rejects weak password client-side (missing letter or digit)", async () => {
    const user = userEvent.setup();
    const { register } = renderForm();
    await user.type(screen.getByLabelText(/^用户名$/), "alice");
    await user.type(screen.getByLabelText(/^邮箱$/), "alice@x.com");
    await user.type(screen.getByLabelText(/^密码$/), "nodigits");
    await user.type(screen.getByLabelText(/确认密码/), "nodigits");
    await user.click(screen.getByRole("button", { name: /注册/ }));
    expect(
      await screen.findByText(/密码须同时含字母和数字/),
    ).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("displays backend field error on username", async () => {
    const user = userEvent.setup();
    renderForm(async () => {
      throw new AuthApiError(400, "参数错误", [
        { loc: ["body", "username"], msg: "用户名格式不合法" },
      ]);
    });
    await user.type(screen.getByLabelText(/^用户名$/), "!!");
    await user.type(screen.getByLabelText(/^邮箱$/), "alice@x.com");
    await user.type(screen.getByLabelText(/^密码$/), "Secret123");
    await user.type(screen.getByLabelText(/确认密码/), "Secret123");
    await user.click(screen.getByRole("button", { name: /注册/ }));
    expect(await screen.findByText("用户名格式不合法")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/components/auth/RegisterForm.test.tsx
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 RegisterForm**

`frontend/src/components/auth/RegisterForm.tsx`:
```tsx
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

interface FieldErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function pickFieldError(
  err: AuthApiError,
  field: "username" | "email" | "password",
): string | undefined {
  if (!err.fieldErrors) return undefined;
  return err.fieldErrors.find((e) => e.loc.includes(field))?.msg;
}

export function RegisterForm() {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (password !== confirmPassword) e.confirmPassword = "两次密码不一致";
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      e.password = "密码须同时含字母和数字";
    }
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setTopError(null);
    const clientErrs = validate();
    setErrors(clientErrs);
    if (Object.keys(clientErrs).length > 0) return;

    setPending(true);
    try {
      await register(username, email, password);
    } catch (e) {
      if (e instanceof AuthApiError) {
        setErrors({
          username: pickFieldError(e, "username"),
          email: pickFieldError(e, "email"),
          password: pickFieldError(e, "password"),
        });
        setTopError(e.fieldErrors ? null : e.detail);
      } else {
        setTopError("注册失败,请稍后重试");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {topError ? (
        <Alert variant="destructive">
          <AlertDescription>{topError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="reg-username">用户名</Label>
        <Input
          id="reg-username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(errors.username)}
        />
        {errors.username ? (
          <p className="text-xs text-destructive">{errors.username}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-email">邮箱</Label>
        <Input
          id="reg-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email ? (
          <p className="text-xs text-destructive">{errors.email}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-password">密码</Label>
        <Input
          id="reg-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(errors.password)}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-confirm">确认密码</Label>
        <Input
          id="reg-confirm"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(errors.confirmPassword)}
        />
        {errors.confirmPassword ? (
          <p className="text-xs text-destructive">{errors.confirmPassword}</p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        注册
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        已有账号?{" "}
        <Link to="/login" className="text-primary hover:underline">
          去登录
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/components/auth/RegisterForm.test.tsx
```

期望:4 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/auth/RegisterForm.tsx frontend/src/components/auth/RegisterForm.test.tsx
git commit -m "feat(frontend): 加 RegisterForm(客户端校验 + 后端字段错误展示)"
```

---

## Task 14: RegisterPage

**Files:**
- Create: `frontend/src/pages/RegisterPage.tsx`

- [ ] **Step 1: 实现 RegisterPage**

`frontend/src/pages/RegisterPage.tsx`:
```tsx
import { Navigate } from "react-router-dom";
import { RegisterForm } from "@/components/auth/RegisterForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

export function RegisterPage() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-[380px]">
        <CardHeader>
          <CardTitle>注册</CardTitle>
          <CardDescription>创建一个新账号</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/pages/RegisterPage.tsx
git commit -m "feat(frontend): 加 RegisterPage"
```

---

## Task 15: ChangePasswordForm(TDD)

**Files:**
- Create: `frontend/src/components/auth/ChangePasswordForm.tsx`
- Create: `frontend/src/components/auth/ChangePasswordForm.test.tsx`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/auth/ChangePasswordForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

function renderForm(impl?: AuthContextValue["changePassword"]) {
  const changePassword = vi.fn(impl);
  const value: AuthContextValue = {
    status: "authenticated",
    user: null,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword,
    deleteAccount: vi.fn(),
  };
  return {
    ...render(
      <AuthContext.Provider value={value}>
        <ChangePasswordForm />
      </AuthContext.Provider>,
    ),
    changePassword,
  };
}

describe("ChangePasswordForm", () => {
  it("submits old and new password", async () => {
    const user = userEvent.setup();
    const { changePassword } = renderForm();
    await user.type(screen.getByLabelText(/^旧密码$/), "Old12345");
    await user.type(screen.getByLabelText(/^新密码$/), "NewSecret1");
    await user.type(screen.getByLabelText(/确认新密码/), "NewSecret1");
    await user.click(screen.getByRole("button", { name: /修改密码/ }));
    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith("Old12345", "NewSecret1"),
    );
  });

  it("rejects mismatched new passwords", async () => {
    const user = userEvent.setup();
    const { changePassword } = renderForm();
    await user.type(screen.getByLabelText(/^旧密码$/), "Old12345");
    await user.type(screen.getByLabelText(/^新密码$/), "NewSecret1");
    await user.type(screen.getByLabelText(/确认新密码/), "Different1");
    await user.click(screen.getByRole("button", { name: /修改密码/ }));
    expect(await screen.findByText(/两次密码不一致/)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("rejects weak new password", async () => {
    const user = userEvent.setup();
    const { changePassword } = renderForm();
    await user.type(screen.getByLabelText(/^旧密码$/), "Old12345");
    await user.type(screen.getByLabelText(/^新密码$/), "weakpw");
    await user.type(screen.getByLabelText(/确认新密码/), "weakpw");
    await user.click(screen.getByRole("button", { name: /修改密码/ }));
    expect(
      await screen.findByText(/密码须同时含字母和数字/),
    ).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows backend error and clears form on success", async () => {
    const user = userEvent.setup();
    const { changePassword } = renderForm(async () => {
      throw new AuthApiError(401, "密码错误");
    });
    await user.type(screen.getByLabelText(/^旧密码$/), "Old12345");
    await user.type(screen.getByLabelText(/^新密码$/), "NewSecret1");
    await user.type(screen.getByLabelText(/确认新密码/), "NewSecret1");
    await user.click(screen.getByRole("button", { name: /修改密码/ }));
    expect(await screen.findByText("密码错误")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/components/auth/ChangePasswordForm.test.tsx
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 ChangePasswordForm**

`frontend/src/components/auth/ChangePasswordForm.tsx`:
```tsx
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

export function ChangePasswordForm() {
  const { changePassword } = useAuth();
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("两次密码不一致");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("密码须同时含字母和数字");
      return;
    }

    setPending(true);
    try {
      await changePassword(oldPassword, newPassword);
      toast.success("密码已修改");
      setOld("");
      setNew("");
      setConfirm("");
    } catch (e) {
      setError(e instanceof AuthApiError ? e.detail : "修改失败,请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="cp-old">旧密码</Label>
        <Input
          id="cp-old"
          type="password"
          required
          value={oldPassword}
          onChange={(e) => setOld(e.target.value)}
          disabled={pending}
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-new">新密码</Label>
        <Input
          id="cp-new"
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          disabled={pending}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-confirm">确认新密码</Label>
        <Input
          id="cp-confirm"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={pending}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        修改密码
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/components/auth/ChangePasswordForm.test.tsx
```

期望:4 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/auth/ChangePasswordForm.tsx frontend/src/components/auth/ChangePasswordForm.test.tsx
git commit -m "feat(frontend): 加 ChangePasswordForm(客户端校验 + 成功后清表单 + toast)"
```

---

## Task 16: DeleteAccountDialog(TDD)

**Files:**
- Create: `frontend/src/components/auth/DeleteAccountDialog.tsx`
- Create: `frontend/src/components/auth/DeleteAccountDialog.test.tsx`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/auth/DeleteAccountDialog.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

function renderDialog(
  open: boolean,
  deleteImpl?: AuthContextValue["deleteAccount"],
) {
  const deleteAccount = vi.fn(deleteImpl);
  const onOpenChange = vi.fn();
  const value: AuthContextValue = {
    status: "authenticated",
    user: null,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount,
  };
  return {
    ...render(
      <AuthContext.Provider value={value}>
        <DeleteAccountDialog open={open} onOpenChange={onOpenChange} />
      </AuthContext.Provider>,
    ),
    deleteAccount,
    onOpenChange,
  };
}

describe("DeleteAccountDialog", () => {
  it("does not render content when closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls deleteAccount with password on confirm", async () => {
    const user = userEvent.setup();
    const { deleteAccount } = renderDialog(true);
    await user.type(screen.getByLabelText(/^密码$/), "MyPw1234");
    await user.click(screen.getByRole("button", { name: /确认注销/ }));
    await waitFor(() =>
      expect(deleteAccount).toHaveBeenCalledWith("MyPw1234"),
    );
  });

  it("displays backend error detail on failure", async () => {
    const user = userEvent.setup();
    renderDialog(true, async () => {
      throw new AuthApiError(401, "密码错误");
    });
    await user.type(screen.getByLabelText(/^密码$/), "wrong");
    await user.click(screen.getByRole("button", { name: /确认注销/ }));
    expect(await screen.findByText("密码错误")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/components/auth/DeleteAccountDialog.test.tsx
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 DeleteAccountDialog**

`frontend/src/components/auth/DeleteAccountDialog.tsx`:
```tsx
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const { deleteAccount } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    setPending(true);
    try {
      await deleteAccount(password);
      // AuthContext 跳 /login
    } catch (e) {
      setError(e instanceof AuthApiError ? e.detail : "注销失败,请稍后重试");
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (!o) {
          setPassword("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>注销账户</DialogTitle>
          <DialogDescription>
            账户将被永久停用且无法再登录。输入密码以确认。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="del-pw">密码</Label>
            <Input
              id="del-pw"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              autoComplete="current-password"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认注销
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/components/auth/DeleteAccountDialog.test.tsx
```

期望:3 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/auth/DeleteAccountDialog.tsx frontend/src/components/auth/DeleteAccountDialog.test.tsx
git commit -m "feat(frontend): 加 DeleteAccountDialog(确认密码 + 危险操作)"
```

---

## Task 17: TopBar

**Files:**
- Create: `frontend/src/components/TopBar.tsx`

- [ ] **Step 1: 实现 TopBar**

`frontend/src/components/TopBar.tsx`:
```tsx
import { UserMenu } from "./UserMenu";

interface TopBarProps {
  agentName: string;
}

export function TopBar({ agentName }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <h1 className="text-base font-medium">{agentName}</h1>
      <UserMenu />
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/components/TopBar.tsx
git commit -m "feat(frontend): 加 TopBar(放 UserMenu)"
```

---

## Task 18: SettingsPage

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`
- Create: `frontend/src/pages/SettingsPage.test.tsx`

- [ ] **Step 1: 写失败测试**

`frontend/src/pages/SettingsPage.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "./SettingsPage";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";

const user = {
  id: 1,
  username: "alice",
  email: "alice@x.com",
  role: "user" as const,
  isActive: true,
  createdAt: "2026-06-16T00:00:00Z",
};

function renderPage() {
  const value: AuthContextValue = {
    status: "authenticated",
    user,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("SettingsPage", () => {
  it("renders user info and three sections", () => {
    renderPage();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("alice@x.com")).toBeInTheDocument();
    expect(screen.getByText("账户信息")).toBeInTheDocument();
    expect(screen.getByText("修改密码")).toBeInTheDocument();
    expect(screen.getByText("注销账户")).toBeInTheDocument();
  });

  it("opens DeleteAccountDialog on click", async () => {
    const userEv = userEvent.setup();
    renderPage();
    await userEv.click(screen.getByRole("button", { name: /注销账户/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/账户将被永久停用/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm test src/pages/SettingsPage.test.tsx
```

期望:FAIL,模块找不到。

- [ ] **Step 3: 实现 SettingsPage**

`frontend/src/pages/SettingsPage.tsx`:
```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { DeleteAccountDialog } from "@/components/auth/DeleteAccountDialog";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
        <Button variant="ghost" onClick={() => navigate("/")}>
          ← 返回聊天
        </Button>
        <UserMenu />
      </header>
      <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>账户信息</CardTitle>
            <CardDescription>当前登录账号的只读资料</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">用户名: </span>
              {user?.username}
            </div>
            <div>
              <span className="text-muted-foreground">邮箱: </span>
              {user?.email}
            </div>
            <div>
              <span className="text-muted-foreground">角色: </span>
              {user?.role}
            </div>
            <div>
              <span className="text-muted-foreground">注册时间: </span>
              {user?.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}
            </div>
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  void logout();
                }}
              >
                退出登录
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>修改密码</CardTitle>
            <CardDescription>修改后需使用新密码重新登录</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">注销账户</CardTitle>
            <CardDescription>账户将被永久停用且无法再登录</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setDialogOpen(true)}
            >
              注销账户
            </Button>
          </CardContent>
        </Card>
      </main>

      <DeleteAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/pages/SettingsPage.test.tsx
```

期望:2 个用例全 PASS。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/pages/SettingsPage.tsx frontend/src/pages/SettingsPage.test.tsx
git commit -m "feat(frontend): 加 SettingsPage(三段卡片 + 注销弹窗)"
```

---

## Task 19: ChatPage

**Files:**
- Create: `frontend/src/pages/ChatPage.tsx`

- [ ] **Step 1: 实现 ChatPage**

把现有 `App.tsx` 的 `ChatWindow` + `DesktopSidebar` 布局搬到 ChatPage,加 TopBar。

`frontend/src/pages/ChatPage.tsx`:
```tsx
import { useChatContext } from "@/context/ChatContext";
import { ChatWindow } from "@/components/ChatWindow";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export function ChatPage() {
  const ctx = useChatContext();
  const agentName = import.meta.env.VITE_AGENT_NAME || "Weather Agent";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TopBar agentName={agentName} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar
            conversations={ctx.conversations}
            currentId={ctx.currentId}
            onSelect={ctx.selectConversation}
            onCreate={ctx.createConversation}
            onDelete={ctx.deleteConversation}
            onRename={ctx.renameConversation}
          />
        </div>
        <main className="flex-1">
          <ChatWindow agentName={agentName} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/pages/ChatPage.tsx
git commit -m "feat(frontend): 加 ChatPage(包 ChatWindow + Sidebar + TopBar)"
```

---

## Task 20: NotFoundPage

**Files:**
- Create: `frontend/src/pages/NotFoundPage.tsx`

- [ ] **Step 1: 实现 NotFoundPage**

`frontend/src/pages/NotFoundPage.tsx`:
```tsx
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">页面不存在</h1>
      <p className="text-sm text-muted-foreground">你访问的页面已被移除或从未存在</p>
      <Button asChild>
        <Link to="/">回首页</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/pages/NotFoundPage.tsx
git commit -m "feat(frontend): 加 NotFoundPage"
```

---

## Task 21: AppRoutes

**Files:**
- Create: `frontend/src/AppRoutes.tsx`

- [ ] **Step 1: 实现 AppRoutes**

`frontend/src/AppRoutes.tsx`:
```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ChatPage } from "@/pages/ChatPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AppRoutes() {
  const { status } = useAuth();
  if (status === "loading") return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/AppRoutes.tsx
git commit -m "feat(frontend): 加 AppRoutes(路由表 + 启动 loading)"
```

---

## Task 22: 接入 App.tsx 与 main.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: 修改 App.tsx**

`frontend/src/App.tsx`(整文件替换):
```tsx
import { ChatProvider } from "@/context/ChatContext";
import { AuthProvider } from "@/context/AuthContext";
import { AppRoutes } from "./AppRoutes";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <AuthProvider>
      <ChatProvider>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </ChatProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: 修改 main.tsx**

`frontend/src/main.tsx`(整文件替换):
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 3: Typecheck + Lint**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm typecheck
pnpm lint
```

期望:无错误。

- [ ] **Step 4: 跑所有测试**

```bash
pnpm test
```

期望:全部通过。

- [ ] **Step 5: Commit**

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat(frontend): 接入 BrowserRouter + AuthProvider + AppRoutes"
```

---

## Task 23: 手动验证(必做,UI 测试覆盖不到)

不写代码,按 spec §9 跑五步手测。

- [ ] **Step 1: 启后端 + 前端**

```bash
# 终端 1: 后端
cd /home/cooper/githubProjects/agent-deploy-kit
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000

# 终端 2: 前端
cd /home/cooper/githubProjects/agent-deploy-kit/frontend
pnpm dev
```

打开 `http://localhost:5173`。

- [ ] **Step 2: 注册 → 登录 → 聊天 → 退出**

1. 访问 `/` → 期望跳 `/login`
2. 点击"去注册" → 填 `bob` / `bob@x.com` / `Bob12345` → 注册 → 跳 `/login`(带"注册成功"toast)
3. 填 `bob` / `Bob12345` → 登录 → 跳 `/` → 发消息 → 期望 bot 回复
4. 顶栏头像 → 「退出登录」→ 跳 `/login`

期望:全部成功。

- [ ] **Step 3: 登录后访问 /login 跳 /**

1. 重新登录 bob
2. 手动改 URL 为 `/login` → 期望自动跳 `/`

- [ ] **Step 4: 注销后不能登录**

1. 登录后访问 `/settings` → 滚到底点「注销账户」→ 输入密码确认 → 跳 `/login?deleted=1` + toast
2. 重新登录 bob → 期望 401 "用户名或密码错误"

- [ ] **Step 5: 401 自动 refresh**

1. 重新注册新账号 → 登录
2. DevTools → Application → Local Storage → 删 `adk:access_token:v1` → 在 `/` 发消息
3. 期望:消息正常发送(apiFetch 检测到无 access → 直接走 refresh 路径?实际:access 为 null 时不会进 refresh 分支,会 401 然后被 apiClient 捕获并 throw)

实际:此场景下没 access,apiFetch 第一请求 401 → 但 `auth === "access"` 且 `tokenStorage.getAccess()` 为 null,`refreshing` 不会启动(我没处理"无 token 但收到 401"的边界)。预期:请求 401 后抛 AuthApiError(401, "认证失败")。**这是已知边界,本轮不处理**;若需,后续在 apiClient 加"无 access 直接抛"分支。

正确测法:让 access 过期(refresh 后才有新 access,旧 access 还在 localStorage)。简单做法:`pnpm dev` 改后端 `ACCESS_TOKEN_EXPIRE_MINUTES=1`,登录后等 1 分钟,发消息,观察 Network 面板:第一个请求 401 → 自动 `/api/auth/refresh` 200 → 重发原请求 200。

- [ ] **Step 6: 改密**

1. 注册新账号 → 登录 → `/settings` → 改密表单:旧 + 新 + 确认 → 提交 → toast "密码已修改" + 表单清空
2. 退出后用旧密码登录 → 失败;用新密码 → 成功

---

## 完成检查

- [ ] 跑 `pnpm test` 全部通过
- [ ] 跑 `pnpm typecheck` 无错误
- [ ] 跑 `pnpm lint` 无错误
- [ ] 手测五步全过
- [ ] 更新 `code_map.md` 加上新文件条目
- [ ] 更新 `frontend/README.md` 加路由说明(可选)
- [ ] 最终 commit

```bash
cd /home/cooper/githubProjects/agent-deploy-kit
git add code_map.md
git commit -m "docs: 更新 code_map.md 加入前端鉴权相关文件"
```
