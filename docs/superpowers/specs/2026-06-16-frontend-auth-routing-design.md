# 前端鉴权 + 路由守卫 设计稿

> 日期:2026-06-16
> 范围:`frontend/` 单仓库改动;不涉及后端。
> 配套后端:已实现的 `/api/auth/*` 8 个端点(见 [后端鉴权设计稿](./2026-06-16-user-auth-design.md))。

## 1. 背景

后端已提供完整的鉴权能力,但前端目前:

- 无路由(`App.tsx` 是单页聊天布局,无 react-router-dom);
- 无登录态;任何人打开就能用聊天;
- 缺少「注册 / 登录 / 退出 / 注销账户 / 改密」的 UI;
- 没有 token 存储、自动续签、401 重放等机制。

需求:**所有功能(聊天、设置、未来的功能)都必须登录后才能使用。**

## 2. 目标

1. 用户可注册、登录、退出、注销账户,以及修改密码。
2. 未登录访问受保护页面 → 自动重定向到 `/login`,登录后跳回原页面。
3. 启动时若 localStorage 仍有 token,自动调用 `/verify` 校验并恢复登录态。
4. access token 过期(15 分钟)期间:401 → 自动 `/refresh` → 用新 access 重放原请求,用户无感。
5. 改密、注销等敏感操作有清晰的确认流程。
6. 与现有前端代码风格一致(Vite + React 18 + TS + Tailwind + shadcn/ui,Vitest 测试,中文 UI)。

## 3. 非目标(本轮不做)

- 忘记密码 / 邮箱验证(后端未提供)
- 用户名 / 邮箱修改(后端未提供修改 user 字段的端点)
- 头像上传
- 多标签页 token 同步(`storage` 事件监听)
- CSRF / httpOnly cookie 迁移
- 角色相关 UI(后端预留 `require_role`,前端暂不消费)
- 改密后强制下线所有设备(后端已知缺陷,见 [endpoints.md 注释](../../api/endpoints.md#patch-apiauthmepassword))

## 4. 架构

### 4.1 顶层组件树

```
<App>
  <BrowserRouter>
    <AuthProvider>             ← 全局登录态(token / user / status)
      <AppRoutes>              ← 按 status 渲染
        /login, /register      公开页
        /                      ProtectedRoute → <ChatPage>
        /settings              ProtectedRoute → <SettingsPage>
      </AppRoutes>
    </AuthProvider>
  </BrowserRouter>
</App>
```

### 4.2 数据流

```
+------------+   apiFetch(path)   +-----------+   fetch   +-------+
| <ChatPage> | -----------------> | apiClient | --------> | 后端  |
+------------+                    +-----------+           +-------+
       ^                                |
       | 401 触发 refresh                | 401 + auth=access
       v                                v
+---------------------+    emit   +---------------------+
| <AuthContext>       | <------- | refreshing 单例     |
| - status / user     |           | 共享并发 refresh    |
| - login/logout/...  | --------> |                     |
+---------------------+  logout  +---------------------+
       |
       v
+---------------------+
| localStorage        |  adk:access_token:v1
| (tokenStorage)      |  adk:refresh_token:v1
+---------------------+
```

### 4.3 启动时序

1. `AuthProvider` mount → 读 `tokenStorage.getAccess()` / `getRefresh()`
2. 若都有值 → `status = "loading"`,并行调 `authApi.verify()`;否则 `status = "anonymous"`
3. `verify` 200 → setState `authenticated` + setUser;`verify` 401 → `tokenStorage.clear()` + `anonymous`
4. `AppRoutes` 在 `loading` 时渲染 `<LoadingScreen/>`;其他状态按路由表渲染

## 5. 文件结构

新增:

```
frontend/src/
├── context/
│   └── AuthContext.tsx              # 全局登录态 + 动作方法
├── lib/
│   ├── authApi.ts                   # 8 个端点纯函数封装
│   ├── apiClient.ts                 # fetch 封装 + 401 自动 refresh + 单例锁
│   ├── tokenStorage.ts              # localStorage 读写(access / refresh)
│   └── authEvents.ts                # 进程内事件总线(apiClient → AuthContext)
├── components/
│   ├── ProtectedRoute.tsx           # 路由守卫
│   ├── LoadingScreen.tsx            # 启动 / 异步 loading
│   ├── UserMenu.tsx                 # 顶栏头像下拉(设置 / 退出)
│   ├── TopBar.tsx                   # / 顶栏(放 UserMenu)
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   ├── ChangePasswordForm.tsx
│   │   └── DeleteAccountDialog.tsx
│   └── ui/
│       ├── input.tsx                # shadcn 包装
│       ├── label.tsx
│       ├── card.tsx
│       ├── alert.tsx
│       ├── avatar.tsx               # @radix-ui/react-avatar
│       └── dialog.tsx               # @radix-ui/react-dialog
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── ChatPage.tsx                 # 包现有 ChatWindow + Sidebar + TopBar
│   ├── SettingsPage.tsx
│   └── NotFoundPage.tsx
├── AppRoutes.tsx                    # 路由表
└── main.tsx                         # 改:挂 <BrowserRouter> + <AuthProvider>
```

修改:

```
frontend/src/
├── App.tsx                          # 简化为 <AppRoutes/>
├── main.tsx                         # 包 <BrowserRouter> + <AuthProvider>
└── package.json                     # 新增 react-router-dom
```

不动:

- `lib/api.ts`(`streamChat` 仍是普通 fetch;若需 token 后续可改为 `apiFetch`;本轮不加,聊天接口后端不要求鉴权)
- `context/ChatContext.tsx` / `hooks/*` / `components/ChatWindow.tsx` 等
- `lib/storage.ts`(对话历史存储)

## 6. 路由表

| 路径 | 组件 | 守卫 | 备注 |
|---|---|---|---|
| `/login` | `<LoginPage/>` | — | 已登录访问 → `<Navigate to="/" replace/>` |
| `/register` | `<RegisterPage/>` | — | 已登录访问 → `<Navigate to="/" replace/>` |
| `/` | `<ChatPage/>` | ProtectedRoute | 未登录 → `/login` + `state.from = location` |
| `/settings` | `<SettingsPage/>` | ProtectedRoute | 同上 |
| `*` | `<NotFoundPage/>` | — | 404 |

`<ProtectedRoute/>` 三态:
- `loading` → `<LoadingScreen/>`
- `anonymous` → `<Navigate to="/login" state={{from: location}} replace/>`
- `authenticated` → `<Outlet/>`(支持嵌套)

## 7. 模块规格

### 7.1 `tokenStorage.ts`

```ts
const ACCESS_KEY = "adk:access_token:v1";
const REFRESH_KEY = "adk:refresh_token:v1";

export const tokenStorage = {
  getAccess(): string | null,
  getRefresh(): string | null,
  setTokens(access: string, refresh: string): void,
  clear(): void,
};
```

### 7.2 `apiClient.ts`

```ts
export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly fieldErrors?: Array<{ loc: string[]; msg: string }>,
  ) { super(detail); this.name = "AuthApiError"; }
}

let refreshing: Promise<string | null> | null = null;

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;                              // 自动 JSON.stringify
  auth?: "access" | "refresh" | "none";        // 默认 "access"
}

export function apiFetch(path: string, opts: ApiFetchOptions = {}): Promise<Response>;
```

行为:
- 自动加 `Content-Type: application/json`(除非 `opts.body` 是 `FormData`)
- 按 `auth` 选 token:`access` 用 `tokenStorage.getAccess()`;`refresh` 用 `tokenStorage.getRefresh()`;`none` 不加
- 401 + `auth === "access"`:
  1. 取 `refreshing` 单例;若空,新建 `doRefresh()`(调 `authApi.refresh` + 写 `tokenStorage`)
  2. await Promise;若返回 `null`(refresh 失败)→ `tokenStorage.clear()` + `authEvents.emit("logout")` + 抛 `AuthApiError(401, "会话已过期")`
  3. 用新 access 重发原请求(重试上限 1 次;再次 401 直接抛错)
- 非 2xx:读 body(`{detail, errors?}`),构造 `AuthApiError` 抛出
- 204:返回 `Response` 不读 body

并发保证:`refreshing` 单例 Promise;同时 10 个请求 401 也只调一次 `/api/auth/refresh`。

### 7.3 `authApi.ts`

8 个端点,签名对应 [endpoints.md](../../api/endpoints.md):

```ts
export function register(body: RegisterIn): Promise<RegisterOut>;
export function login(body: LoginIn): Promise<LoginOut>;
export function logout(): Promise<void>;
export function refresh(): Promise<TokenPairOut>;
export function verify(): Promise<VerifyOut>;
export function me(): Promise<UserOut>;
export function changePassword(body: ChangePasswordIn): Promise<void>;
export function deleteMe(body: DeleteMeIn): Promise<void>;
```

- 类型定义放同文件顶部(`RegisterIn` / `LoginIn` 等),字段与后端 `schemas.py` 一致
- 全部走 `apiFetch`;`login` / `refresh` 用 `auth: "none"` / `auth: "refresh"`
- 不解析业务状态码外的字段,只返回 `data`;错误由 `apiClient` 抛

### 7.4 `authEvents.ts`

```ts
type AuthEvent = "logout";
export const authEvents = {
  on(event: AuthEvent, handler: () => void): () => void,  // 返回 unsubscribe
  emit(event: AuthEvent): void,
};
```

`apiClient` 在 refresh 失败时 `emit("logout")`;`AuthContext` mount 时 `on("logout", ...)` 清理 state。

### 7.5 `AuthContext.tsx`

```ts
export interface User {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  isActive: boolean;
  createdAt: string;  // ISO 8601
}

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  isAuthenticated: boolean;  // status === "authenticated"

  login(usernameOrEmail: string, password: string): Promise<void>;
  register(username: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  deleteAccount(password: string): Promise<void>;
}
```

实现要点:
- 内部用 `useReducer` 管 `status` / `user`;`useCallback` 暴露动作
- `login` 成功后用 `useNavigate()` 跳回 `location.state?.from?.pathname ?? "/"`(从 useLocation 读)
- `register` 成功后**不**自动登录:跳 `/login` + toast "注册成功,请登录"
- `logout` 先调 `authApi.logout()`,后端错误也忽略 → 清 token → 清 state → 跳 `/login`;不清对话历史(见 §10.1)
- `deleteAccount` 成功后清 token + 清 state + toast + 跳 `/login?deleted=1`
- `changePassword` 成功后清空调用方表单(由 UI 组件负责);不自动登出(见 §10.2)
- mount 时 `on("logout", ...)` 订阅;unmount 取消
- `throw AuthApiError`,不吞错;UI 用 try/catch 拿 detail / fieldErrors 展示

### 7.6 `<ProtectedRoute/>`

```tsx
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

### 7.7 表单组件契约

| 组件 | 入参 | 出参 / 副作用 |
|---|---|---|
| `<LoginForm/>` | — | onSuccess 跳 `from` 或 `/`;错误显示在顶部 Alert |
| `<RegisterForm/>` | — | 客户端先校验(密码一致 + 强度)→ onSuccess 跳 `/login`;字段错误显示在对应 Input 下 |
| `<ChangePasswordForm/>` | — | onSuccess 清空表单 + toast;不跳页 |
| `<DeleteAccountDialog/>` | `open`, `onOpenChange` | 内部含密码输入;onSuccess 调 `useAuth().deleteAccount()` |

UI 行为:
- Submit 期间禁用按钮 + Spinner;`useAuth()` 抛 `AuthApiError` 时:`detail` 顶部 Alert;`fieldErrors` 在对应字段下红字
- 密码强度:客户端正则 `/[A-Za-z]/` + `/[0-9]/`,两个都通过才放行(与后端一致)
- 确认密码:仅前端校验,后端不重复

### 7.8 `<TopBar/>` + `<UserMenu/>`

`<TopBar/>` 在 `<ChatPage/>` 顶部 56px:
- 左侧:当前智能体名(`VITE_AGENT_NAME` 默认 `Weather Agent`)
- 右侧:`<UserMenu/>`

`<UserMenu/>` Radix DropdownMenu:
- Trigger: `<Avatar>`(fallback 用户名首字母)+ `username`
- Content:邮箱(只读) / 「账户设置」(`/settings`) / 「退出登录」(调 `useAuth().logout()`)

### 7.9 `<SettingsPage/>` 三段卡片

1. **账户信息**(只读 Card):username / email / role / createdAt(本地 `new Date(...).toLocaleString()`)
2. **修改密码** Card:内含 `<ChangePasswordForm/>`
3. **Danger Zone** Card(红色边框):红色按钮「注销账户」→ 打开 `<DeleteAccountDialog/>`

## 8. 错误处理边界

| 场景 | 行为 |
|---|---|
| 后端 400 + `errors` 数组 | `AuthApiError.fieldErrors` 携带,UI 在对应字段红字显示 |
| 后端 401(非自动 refresh 场景,例如 login 错) | `AuthApiError.detail = "用户名或密码错误"`,UI Alert |
| 后端 429(登录限速) | `detail` 直接显示"尝试过于频繁,请稍后再试" |
| 后端 409(register 时用户名/邮箱冲突) | `detail` 直接显示 |
| 网络断开 / fetch 抛 TypeError | `apiFetch` 包装为 `AuthApiError(0, "网络错误,请检查连接")` |
| refresh 失败 | 清 token + emit "logout" + 跳 `/login`(不弹错误 toast) |
| 改密后旧 access 仍有效 | 不强制登出;与后端已知问题一致(见 [endpoints.md](../../api/endpoints.md)) |
| register 后 5xx | UI Alert;不回滚输入,允许重试 |
| 并发 401 | `refreshing` 单例 Promise,只调一次 `/refresh` |

## 9. 测试

每个新文件配同名 `*.test.ts(x)`,沿用 `vi.mock` + `MemoryRouter` 模式。

| 文件 | 关键用例 |
|---|---|
| `lib/tokenStorage.test.ts` | get/set/clear;空字符串容错;key 隔离 |
| `lib/apiClient.test.ts` | 200 直通;401 → refresh → 重放;并发 401 共享 refresh Promise;refresh 失败 emit "logout";非 2xx 构造 AuthApiError |
| `lib/authApi.test.ts` | 8 个端点调用形状(签名、路径、method、body) |
| `lib/authEvents.test.ts` | on / emit / unsubscribe |
| `context/AuthContext.test.tsx` | 启动 verify 成功 / 失败;login 跳 from;register 跳 /login;logout 清 token;deleteAccount 跳 /login?deleted=1;authEvents "logout" 触发清理 |
| `components/ProtectedRoute.test.tsx` | loading → LoadingScreen;anonymous → Navigate;authenticated → Outlet |
| `components/auth/LoginForm.test.tsx` | 提交调用 login;AuthApiError.detail 展示;loading 态 |
| `components/auth/RegisterForm.test.tsx` | 客户端校验;提交调用 register;fieldErrors 红字 |
| `components/auth/ChangePasswordForm.test.tsx` | 同上 |
| `components/auth/DeleteAccountDialog.test.tsx` | 密码错展示;onSuccess 调 deleteAccount |
| `components/UserMenu.test.tsx` | 展开;「退出登录」调 logout;「账户设置」导航 |
| `pages/SettingsPage.test.tsx` | 渲染三段卡片;User 信息从 useAuth 读 |

手测脚本(必做):
1. 注册 → 跳 /login → 登录 → 进 / → 发消息 → 顶栏退出 → 回 /login
2. 登录后直接访问 /login → 重定向到 /
3. 删账户后用相同用户名登录应失败(`is_active=false`)
4. DevTools 删 access token → 受保护请求自动 refresh + 重放,无感
5. 改密成功后旧 access 至 15 分钟内仍可访问(已知后端行为)

## 10. 决策记录

### 10.1 登出后保留对话历史

`lib/storage.ts` 的 `STORAGE_KEY = "adk:conversations:v1"` 不在登出时清理;对话与账户无强绑定(Q7 决定)。后续若需"换账号独立",在 ChatContext 加"清空"动作即可,不破坏现有契约。

### 10.2 改密后不自动登出

后端 `change_password` 不会吊销当前 refresh token(详见 [endpoints.md 注释](../../api/endpoints.md#patch-apiauthmepassword) —— `Authorization` 头被鉴权依赖占用,无法同时传 refresh)。前端与之对齐:改密成功不跳页、不清 token。若用户希望"改密即下线所有设备",可手动调 `/logout` 清本地(后续追加)。

### 10.3 register 后不自动登录

跳 `/login` 让用户重新输密码,避免误以为已登录。

### 10.4 不引第三方鉴权库

`react-auth-kit` / `auth-react` 等会增加黑盒依赖,违背项目"小而清晰"原则。手写 ~200 行可控。

### 10.5 shadcn 新增组件

仅新增 6 个最常用:`input` / `label` / `card` / `alert` / `avatar` / `dialog`;Radix `separator` 已装但本轮不引,避免噪音。

## 11. 实施顺序(供 plan 拆分)

1. 装 `react-router-dom@^6.21.0`;跑通空路由(`/login` 占位 → 跳 `/`)
2. `tokenStorage` + `authEvents` + 单测
3. `apiClient` + 单测(refresh 单例是核心)
4. `authApi` 8 端点 + 单测
5. `AuthContext` + 单测
6. shadcn 新组件(input/label/card/alert/avatar/dialog)
7. `<ProtectedRoute/>` / `<LoadingScreen/>` / `<UserMenu/>` / `<TopBar/>`
8. `LoginPage` + `LoginForm` + 单测
9. `RegisterPage` + `RegisterForm` + 单测
10. `SettingsPage` + `ChangePasswordForm` + `DeleteAccountDialog` + 单测
11. `ChatPage`(包现有 ChatWindow + Sidebar + TopBar)
12. `AppRoutes` 接入 `App.tsx`;`main.tsx` 包 `<BrowserRouter>` + `<AuthProvider>`
13. `NotFoundPage`
14. 手测脚本 §9 五步

## 12. 风险与回滚

- **风险 1**:`apiClient` 单例 refresh 实现有 bug 导致 token 卡死。**缓解**:单测覆盖 200 / 401 / refresh 失败三种路径;`tokenStorage.clear()` 可手动恢复。
- **风险 2**:shadcn 组件风格与项目既有组件不一致。**缓解**:沿用现有 `button.tsx` 写法(同样 cva + Slot + forwardRef),手写薄包装不引第三方组件库差异。
- **风险 3**:`react-router-dom` 升级到 v7 破坏 API。**缓解**:固定 `^6.21.0`(v6 LTS 行为稳定);升 v7 需重写 `useNavigate` / `useLocation`。
- **回滚**:`git revert` 本次 commit;前端无数据库依赖,无外部副作用。
