# API 接口文档

> 后端接口索引。前端开发查阅入口。详细字段以 [endpoints.md](./endpoints.md) 为准。

## 快速开始（5 分钟上手）

按下面 4 步即可对接后端。

### 步骤 1：拿 TypeScript 类型

去 [endpoints.md 附录 A](./endpoints.md#附录-atypescript-类型) 整体复制到 `frontend/src/types/api.ts`（或项目已有的类型文件）。21 个 interface / type，覆盖所有端点的入参和出参。

### 步骤 2：写一个鉴权请求层

参考下面 [前端集成流程](#前端集成流程) 里的 `apiFetch()`，封装到 `frontend/src/lib/apiClient.ts`（或项目已有等价位置）。核心三点：

1. 自动从本地存储读 `access_token` 并拼 `Authorization: Bearer ...`
2. 遇到 401 → 用 `refresh_token` 调 `/api/auth/refresh` → 用新 token 重试原请求
3. `refresh_token` 也失效 → 清本地 + 跳登录页

### 步骤 3：第一个请求（登录）

```ts
import { apiFetch } from '@/lib/apiClient';

const res = await apiFetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'abc12345' }),
});
const tokens = (await res.json()) as LoginOut;
localStorage.setItem('access_token', tokens.access_token);
localStorage.setItem('refresh_token', tokens.refresh_token);
// tokens.expires_in 单位是秒；可 setTimeout(refresh, (expires_in - 60) * 1000)
```

### 步骤 4：第一个受保护请求

```ts
const me = (await apiFetch('/api/auth/me').then((r) => r.json())) as UserOut;
console.log(me.username, me.role);
```

完成。剩余功能查下面 [按前端功能查 API](#按前端功能查-api)。

## 模块划分

| 模块 | 前缀 | 鉴权 | 端点数 |
|------|------|------|--------|
| 健康检查 | `/health` | 无 | 1 |
| 认证 | `/api/auth` | 部分需 Bearer | 8 |
| 聊天 | `/api/chat` | 无（依赖后端 LLM 配置） | 2 |

## 按前端功能查 API

> "我要实现 X 功能" → 查这张表 → 点击直接跳到 endpoints.md 的字段细节。

| 前端功能 | 用到的端点 |
|----------|-----------|
| 启动期判断是否已登录 | [`GET /api/auth/verify`](endpoints.md#get-api-auth-verify) |
| 登录页 | [`POST /api/auth/login`](endpoints.md#post-api-auth-login) |
| 注册页 | [`POST /api/auth/register`](endpoints.md#post-api-auth-register) |
| 退出按钮 | [`POST /api/auth/logout`](endpoints.md#post-api-auth-logout) |
| 自动刷新 access token（401 后） | [`POST /api/auth/refresh`](endpoints.md#post-api-auth-refresh) |
| 个人资料页 / 顶栏用户信息 | [`GET /api/auth/me`](endpoints.md#get-api-auth-me) |
| 改密表单 | [`PATCH /api/auth/me/password`](endpoints.md#patch-api-auth-me-password) |
| 注销账号 | [`DELETE /api/auth/me`](endpoints.md#delete-api-auth-me) |
| 同步聊天（拿到最终回复即可） | [`POST /api/chat`](endpoints.md#post-api-chat) |
| 流式聊天（含中间步骤渲染） | [`POST /api/chat/stream`](endpoints.md#post-api-chat-stream) |

## 前端集成流程

### Token 存储

- 登录成功后拿到 `access_token` + `refresh_token` + `expires_in`
- 建议存 `localStorage`（跨标签页共享）或 `sessionStorage`（更严格，关闭即清）
- **不要**把 token 放在非 httpOnly cookie（XSS 风险）

### 拼 Authorization 头

- 受保护端点统一：`Authorization: Bearer <access_token>`
- `/api/auth/refresh` 是**唯一例外**：用 **`refresh_token`** 作 Bearer
- 推荐封装 `apiFetch()`：自动读 access token、拼头、JSON 解析、错误归一化

### 401 自动 refresh 模式

```js
async function apiFetch(path, opts = {}) {
  const doFetch = () => fetch(path, {
    ...opts,
    headers: {
      ...opts.headers,
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });
  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getRefreshToken()}` },
    });
    if (refreshed.ok) {
      const { access_token, refresh_token, expires_in } = await refreshed.json();
      saveTokens(access_token, refresh_token, expires_in);
      res = await doFetch();  // 重试原请求
    } else {
      clearTokens();
      location.assign('/login');  // refresh 也失败 → 踢回登录
      return;
    }
  }
  return res;
}
```

### expires_in 处理

- `expires_in` 单位是**秒**（不是毫秒）
- 提前 ~60s 主动 refresh：`setTimeout(refresh, (expires_in - 60) * 1000)`
- 倒计时建议持久化（页面刷新后能恢复）

## 鉴权约定

- 除 `/health` 和登录 / 注册 / 刷新端点外，所有接口需 `Authorization: Bearer <access_token>`
- 401 → access token 过期或无效，前端应尝试 refresh
- 403 → 角色不足（当前未启用角色守卫）
- 429 → 登录限速（每分钟 5 次失败，由 `AUTH_LOGIN_RATE_LIMIT_PER_MIN` 控制，按 IP）

## 通用错误格式

```json
{
  "detail": "参数错误",
  "errors": [ { "field": "email", "message": "value is not a valid email address" } ]
}
```

- `detail`：人类可读的错误描述
- `errors`：Pydantic 校验错误列表（**仅在 400（参数错误）时出现**；业务错误 401/409 只有 `detail`）

## 跨端点注意事项

- `/api/auth/refresh` 用 **refresh_token**（不是 access）作 Bearer —— 反直觉
- `/api/auth/logout` 仅做依赖校验，**不真正撤销 token**；前端要本地清掉两个 token
- `/api/auth/me/password` 可在同 `Authorization` 头里塞 refresh token 来吊销旧 refresh
- `/api/auth/login` 防枚举：用户名错 / 密码错 / 账号禁用 返回**同一文案** `用户名或密码错误`
- `/api/chat/stream` 流已开始后的异常以 `event: error` 追加，不触发 HTTP 错误

## 环境与 CORS

### 后端地址（Base URL）

| 环境 | Base URL | 启动方式 |
|------|----------|----------|
| 本地开发 | `http://localhost:8000` | `uv run uvicorn backend.main:app --reload --port 8000` |
| 生产 | 由部署决定 | 后端镜像构建与编排见项目部署文档（本仓库 `docker/` 仅含基础设施服务） |

前端通过环境变量配置（参见 `frontend/.env.example`）：

```bash
# frontend/.env.local（不提交）
VITE_API_BASE=http://localhost:8000
```

### CORS

后端在 `backend/main.py` 显式声明：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- **前端开发无需配置 Vite proxy**，直接 fetch 真实 URL 即可
- 如果生产环境收紧 CORS（如改为指定 origin），前端需要同步调整 `VITE_API_BASE` 对应的 origin
- 鉴权靠 `Authorization` 头，**不依赖 cookie**，因此 CORS 配置对鉴权无额外约束

## 端点总览

> 点击路径跳转到 endpoints.md 详细字段。完整 11 端点。

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | [`/health`](endpoints.md#get-health) | 无 | 健康检查 |
| POST | [`/api/auth/register`](endpoints.md#post-api-auth-register) | 无 | 注册 |
| POST | [`/api/auth/login`](endpoints.md#post-api-auth-login) | 无 | 登录 |
| POST | [`/api/auth/logout`](endpoints.md#post-api-auth-logout) | 需 Bearer | 退出登录 |
| POST | [`/api/auth/refresh`](endpoints.md#post-api-auth-refresh) | 需 **refresh** token | 刷新 access token |
| GET | [`/api/auth/verify`](endpoints.md#get-api-auth-verify) | 需 Bearer | 校验 token 有效性 |
| GET | [`/api/auth/me`](endpoints.md#get-api-auth-me) | 需 Bearer | 获取当前用户 |
| PATCH | [`/api/auth/me/password`](endpoints.md#patch-api-auth-me-password) | 需 Bearer | 改密 |
| DELETE | [`/api/auth/me`](endpoints.md#delete-api-auth-me) | 需 Bearer | 注销账号 |
| POST | [`/api/chat`](endpoints.md#post-api-chat) | 无（依赖后端 LLM） | 同步聊天 |
| POST | [`/api/chat/stream`](endpoints.md#post-api-chat-stream) | 无（依赖后端 LLM） | SSE 流式聊天 |

详细字段、错误码、TypeScript 类型、易踩坑见 [endpoints.md](./endpoints.md)。
