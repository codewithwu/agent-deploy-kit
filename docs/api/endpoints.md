# API Endpoints · 接口详细参考

> 所有接口均挂载在 `backend/` 下；按模块分组。错误响应统一为 `{"detail": "...", "errors": [...]}` 格式。

## 目录

> 点击跳转。每个端点的"字段表 + 完整示例 + 错误码"在该小节。

**健康检查**

- [GET /health](#get-health)

**认证 (`/api/auth`)**

- [POST /api/auth/register](#post-api-auth-register) — 注册
- [POST /api/auth/login](#post-api-auth-login) — 登录
- [POST /api/auth/logout](#post-api-auth-logout) — 退出登录
- [POST /api/auth/refresh](#post-api-auth-refresh) — 刷新 access token
- [GET /api/auth/verify](#get-api-auth-verify) — 校验 token 有效性
- [GET /api/auth/me](#get-api-auth-me) — 获取当前用户
- [PATCH /api/auth/me/password](#patch-api-auth-me-password) — 改密
- [DELETE /api/auth/me](#delete-api-auth-me) — 注销账号

**聊天 (`/api/chat`)**

- [POST /api/chat](#post-api-chat) — 同步聊天
- [POST /api/chat/stream](#post-api-chat-stream) — SSE 流式聊天

**附录**

- [附录 A TypeScript 类型](#附录-a-typescript-类型)
- [附录 B 前端易踩坑](#附录-b-前端易踩坑)
- [附录 C 文档维护说明](#附录-c-文档维护说明)

> 锚点格式：方法名小写 + 路径分隔符 `-` 替换。GitHub / VS Code 预览 / VitePress / GitLab 均兼容。

## 健康检查

### GET /health

#### Description

健康检查端点。返回服务是否正常启动。

#### Parameters

无。

#### Response

**200 OK** · 类型：`HealthResponse`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 是 | 固定值 `"ok"` |

**完整示例**

```json
{ "status": "ok" }
```

无错误响应。

#### Examples

**cURL**

```bash
curl -X GET "https://api.example.com/health"
```

**JavaScript**

```js
const res = await fetch('/health');
const { status } = await res.json();
```

**Python**

```python
import requests
r = requests.get('https://api.example.com/health')
print(r.json())  # {'status': 'ok'}
```

---

## 认证 (/api/auth)

> 前缀由 `backend/main.py` 的 `app.include_router(auth_router, prefix="/api/auth")` 注入。
> Token 有效期默认值：`access_token = 15 分钟`、`refresh_token = 7 天`（由 `backend/auth/config.py` 控制，可通过 env 调整）。

### POST /api/auth/register

#### Description

注册新用户。用户名 / 邮箱不可重复，密码需满足强度规则（8-128 位，必须含字母和数字）。

#### Parameters

请求体（`RegisterIn`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `username` | string | 是 | 3-50 位；仅字母 / 数字 / 下划线 / 点 / 连字符 |
| `email` | string (email) | 是 | 合法的邮箱格式（前端用 HTML5 type=email + 后端 EmailStr 校验） |
| `password` | string | 是 | 8-128 位；必须含字母和数字 |

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "abc12345"
}
```

#### Response

**201 Created** · 类型：`RegisterOut`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | number | 是 | 新用户主键 |
| `username` | string | 是 | 用户名（与请求一致） |
| `email` | string | 是 | 邮箱（与请求一致） |
| `role` | enum: `user` \| `admin` | 是 | 角色；注册默认 `user` |

**完整示例**

```json
{
  "user_id": 1,
  "username": "alice",
  "email": "alice@example.com",
  "role": "user"
}
```

**4xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 400 | `参数错误` + `errors[]` | 请求体字段缺失 / 格式错 / 密码强度不足 / 用户名规则不符 |
| 409 | `用户名已被使用` | `users.username` 唯一约束冲突 |
| 409 | `邮箱已被使用` | `users.email` 唯一约束冲突 |

#### Examples

**cURL**

```bash
curl -X POST "https://api.example.com/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"abc12345"}'
```

**JavaScript**

```js
const res = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'alice',
    email: 'alice@example.com',
    password: 'abc12345',
  }),
});
const user = await res.json();
```

**Python**

```python
import requests
r = requests.post(
    'https://api.example.com/api/auth/register',
    json={'username': 'alice', 'email': 'alice@example.com', 'password': 'abc12345'},
)
print(r.status_code, r.json())
```

---

### POST /api/auth/login

#### Description

用户名 / 密码登录，返回 access + refresh token 配对。`username` 字段同时接受 username 或 email。限速：每分钟 5 次失败尝试 → 429（`AUTH_LOGIN_RATE_LIMIT_PER_MIN`）。

#### Parameters

请求体（`LoginIn`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `username` | string | 是 | 1-100 位；接受 username 或 email |
| `password` | string | 是 | 1-128 位 |

```json
{
  "username": "alice",
  "password": "abc12345"
}
```

#### Response

**200 OK** · 类型：`LoginOut`（继承 `TokenPairOut`，附加 `user` 字段）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `access_token` | string (JWT) | 是 | 用于 `Authorization: Bearer ...` 头；默认 **15 分钟**有效 |
| `refresh_token` | string (JWT) | 是 | 用于 `POST /api/auth/refresh` 换新 token；默认 **7 天**有效 |
| `token_type` | string | 否，默认 `"bearer"` | 固定值 `"bearer"` |
| `expires_in` | number | 是 | **单位：秒**。access_token 剩余秒数；前端可据此定时 refresh |
| `user` | object (`UserOut`) | 是 | 当前登录用户完整信息 |
| `user.id` | number | 是 | 用户主键 |
| `user.username` | string | 是 | 用户名（全局唯一） |
| `user.email` | string | 是 | 邮箱（全局唯一） |
| `user.role` | enum: `user` \| `admin` | 是 | 角色（当前仅 `user`；预留 `admin`） |
| `user.is_active` | boolean | 是 | 是否启用；`false` 时该账号无法登录 |
| `user.created_at` | string (ISO 8601) | 是 | 账号创建时间，UTC |

**完整示例**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": 1,
    "username": "alice",
    "email": "alice@example.com",
    "role": "user",
    "is_active": true,
    "created_at": "2026-06-19T10:30:00Z"
  }
}
```

**4xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 400 | `参数错误` + `errors[]` | 请求体不合法 |
| 401 | `用户名或密码错误` | username / password 不匹配（防枚举统一文案） |
| 401 | `用户名或密码错误` | 用户存在但 `is_active=false` |
| 429 | `尝试过于频繁，请稍后再试` | 限速命中（每 IP 每分钟 5 次，见 `AUTH_LOGIN_RATE_LIMIT_PER_MIN`） |

#### Examples

**cURL**

```bash
curl -X POST "https://api.example.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"abc12345"}'
```

**JavaScript**

```js
const res = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'abc12345' }),
});
const { access_token, refresh_token, expires_in, user } = await res.json();
// expires_in 单位是秒；建议 setTimeout(refresh, expires_in - 60)
```

**Python**

```python
import requests
r = requests.post(
    'https://api.example.com/api/auth/login',
    json={'username': 'alice', 'password': 'abc12345'},
)
tokens = r.json()
```

---

### POST /api/auth/logout

#### Description

退出登录。简化实现：access token 无 jti，仅做依赖校验，不真正撤销任何 token。前端应同时丢弃本地 access / refresh。

#### Parameters

需要 `Authorization: Bearer <access_token>`。

无请求体。

#### Response

**204 No Content** · 无响应体

**4xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 401 | `认证失败` | token 缺失或无效 |

#### Examples

**cURL**

```bash
curl -X POST "https://api.example.com/api/auth/logout" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**JavaScript**

```js
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}` },
});
// 同步清除本地 access/refresh token
```

**Python**

```python
import requests
requests.post(
    'https://api.example.com/api/auth/logout',
    headers={'Authorization': f'Bearer {access_token}'},
)
```

---

### POST /api/auth/refresh

#### Description

用 refresh token 换新 access + refresh。从 `Authorization: Bearer <refresh_token>` 抽取 refresh token。

#### Parameters

需要 `Authorization: Bearer <refresh_token>`（注意：这里是 **refresh**，不是 access）。

无请求体。

#### Response

**200 OK** · 类型：`TokenPairOut`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `access_token` | string (JWT) | 是 | 新 access token；默认 15 分钟有效 |
| `refresh_token` | string (JWT) | 是 | 新 refresh token；默认 7 天有效 |
| `token_type` | string | 否，默认 `"bearer"` | 固定值 `"bearer"` |
| `expires_in` | number | 是 | **单位：秒**。新 access_token 剩余秒数 |

**完整示例**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900
}
```

**4xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 401 | `认证失败` | Authorization 头缺失 / 不是 Bearer / refresh token 无效 |

#### Examples

**cURL**

```bash
curl -X POST "https://api.example.com/api/auth/refresh" \
  -H "Authorization: Bearer YOUR_REFRESH_TOKEN"
```

**JavaScript**

```js
const res = await fetch('/api/auth/refresh', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${refreshToken}` },
});
const { access_token, refresh_token, expires_in } = await res.json();
```

**Python**

```python
import requests
r = requests.post(
    'https://api.example.com/api/auth/refresh',
    headers={'Authorization': f'Bearer {refresh_token}'},
)
new_tokens = r.json()
```

---

### GET /api/auth/verify

#### Description

校验当前 access token 是否有效，并返回用户信息。常用于前端启动期确认登录态。

#### Parameters

需要 `Authorization: Bearer <access_token>`。

#### Response

**200 OK** · 类型：`VerifyOut`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `valid` | boolean | 是 | 当前恒为 `true`（无效会直接返回 401） |
| `user` | object (`UserOut`) | 是 | 当前用户完整信息 |
| `user.id` | number | 是 | 用户主键 |
| `user.username` | string | 是 | 用户名 |
| `user.email` | string | 是 | 邮箱 |
| `user.role` | enum: `user` \| `admin` | 是 | 角色 |
| `user.is_active` | boolean | 是 | 是否启用 |
| `user.created_at` | string (ISO 8601) | 是 | 账号创建时间，UTC |

**完整示例**

```json
{
  "valid": true,
  "user": {
    "id": 1,
    "username": "alice",
    "email": "alice@example.com",
    "role": "user",
    "is_active": true,
    "created_at": "2026-06-19T10:30:00Z"
  }
}
```

**4xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 401 | `认证失败` | token 缺失或无效 |

#### Examples

**cURL**

```bash
curl -X GET "https://api.example.com/api/auth/verify" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**JavaScript**

```js
const res = await fetch('/api/auth/verify', {
  headers: { 'Authorization': `Bearer ${accessToken}` },
});
const { valid, user } = await res.json();
```

**Python**

```python
import requests
r = requests.get(
    'https://api.example.com/api/auth/verify',
    headers={'Authorization': f'Bearer {access_token}'},
)
print(r.json())  # {'valid': True, 'user': {...}}
```

---

### GET /api/auth/me

#### Description

获取当前登录用户的信息。

#### Parameters

需要 `Authorization: Bearer <access_token>`。

#### Response

**200 OK** · 类型：`UserOut`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | number | 是 | 用户主键 |
| `username` | string | 是 | 用户名（全局唯一） |
| `email` | string | 是 | 邮箱（全局唯一） |
| `role` | enum: `user` \| `admin` | 是 | 角色 |
| `is_active` | boolean | 是 | 是否启用 |
| `created_at` | string (ISO 8601) | 是 | 账号创建时间，UTC |

**完整示例**

```json
{
  "id": 1,
  "username": "alice",
  "email": "alice@example.com",
  "role": "user",
  "is_active": true,
  "created_at": "2026-06-19T10:30:00Z"
}
```

**4xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 401 | `认证失败` | token 缺失或无效 |

#### Examples

**cURL**

```bash
curl -X GET "https://api.example.com/api/auth/me" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**JavaScript**

```js
const res = await fetch('/api/auth/me', {
  headers: { 'Authorization': `Bearer ${accessToken}` },
});
const user = await res.json();
```

**Python**

```python
import requests
r = requests.get(
    'https://api.example.com/api/auth/me',
    headers={'Authorization': f'Bearer {access_token}'},
)
print(r.json())
```

---

### PATCH /api/auth/me/password

#### Description

改密。可选地在 `Authorization` 头里携带 refresh token 以吊销旧 refresh。

#### Parameters

请求体（`ChangePasswordIn`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `old_password` | string | 是 | 当前密码（1-128 位） |
| `new_password` | string | 是 | 新密码（8-128 位，必须含字母和数字） |

```json
{ "old_password": "abc12345", "new_password": "xyz98765" }
```

需要 `Authorization: Bearer <access_token>`（同时可在同头携带 refresh token 以吊销旧 refresh，简化约定）。

#### Response

**204 No Content** · 无响应体

**4xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 400 | `参数错误` + `errors[]` | 新密码强度不足 / 字段缺失 |
| 401 | `认证失败` | access token 缺失或无效 |
| 401 | `密码错误` | old_password 错误 |

#### Examples

**cURL**

```bash
curl -X PATCH "https://api.example.com/api/auth/me/password" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"abc12345","new_password":"xyz98765"}'
```

**JavaScript**

```js
await fetch('/api/auth/me/password', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ old_password: 'abc12345', new_password: 'xyz98765' }),
});
```

**Python**

```python
import requests
requests.patch(
    'https://api.example.com/api/auth/me/password',
    headers={'Authorization': f'Bearer {access_token}'},
    json={'old_password': 'abc12345', 'new_password': 'xyz98765'},
)
```

---

### DELETE /api/auth/me

#### Description

注销当前账号（需校验密码）。

#### Parameters

请求体（`DeleteMeIn`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `password` | string | 是 | 当前密码（1-128 位） |

```json
{ "password": "abc12345" }
```

需要 `Authorization: Bearer <access_token>`。

#### Response

**204 No Content** · 无响应体

**4xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 401 | `认证失败` | token 缺失或无效 |
| 401 | `密码错误` | password 错误 |

#### Examples

**cURL**

```bash
curl -X DELETE "https://api.example.com/api/auth/me" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"abc12345"}'
```

**JavaScript**

```js
await fetch('/api/auth/me', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ password: 'abc12345' }),
});
```

**Python**

```python
import requests
requests.delete(
    'https://api.example.com/api/auth/me',
    headers={'Authorization': f'Bearer {access_token}'},
    json={'password': 'abc12345'},
)
```

---

## 聊天 (/api/chat)

> 前缀由 `backend/main.py` 的 `app.include_router(chat_router, prefix="/api/chat")` 注入。
> 两个端点当前均无鉴权依赖（依赖后端 LLM 配置；详见 `backend/agent_loader.py`）。

### POST /api/chat

#### Description

同步聊天：发送消息列表，返回 agent 的最终回复。

#### Parameters

请求体（`ChatRequest`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | array | 是 | 消息列表，非空 |
| `messages[].role` | string | 否，默认 `"user"` | 消息角色（`user` / `assistant` / `system`） |
| `messages[].content` | string | 是 | 消息内容 |

```json
{
  "messages": [
    { "role": "user", "content": "北京今天天气怎么样？" }
  ]
}
```

#### Response

**200 OK** · 类型：`ChatResponse`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `reply` | string | 是 | agent 最终回复文本；中间步骤被折叠，仅返回最后一条消息的 content |

**完整示例**

```json
{ "reply": "北京今天晴，气温 22-28°C。" }
```

**4xx / 5xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 400 | `messages must not be empty` | `messages` 数组为空 |
| 500 | `<异常文本>` | `agent.invoke` 抛异常（LLM / 工具错误等） |
| 500 | `agent returned no messages` | agent 返回结果里没有 messages |

#### Examples

**cURL**

```bash
curl -X POST "https://api.example.com/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```

**JavaScript**

```js
const res = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: '你好' }],
  }),
});
const { reply } = await res.json();
```

**Python**

```python
import requests
r = requests.post(
    'https://api.example.com/api/chat',
    json={'messages': [{'role': 'user', 'content': '你好'}]},
)
print(r.json())  # {'reply': '...'}
```

---

### POST /api/chat/stream

#### Description

SSE 流式聊天：服务端按 agent 步骤产出事件，前端逐块渲染。

响应头：`Content-Type: text/event-stream`、`Cache-Control: no-store`、`X-Accel-Buffering: no`（禁用 nginx 缓冲）。

#### Parameters

请求体（`ChatRequest`）：与 `POST /api/chat` 相同。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | array | 是 | 消息列表，非空 |
| `messages[].role` | string | 否，默认 `"user"` | 消息角色 |
| `messages[].content` | string | 是 | 消息内容 |

```json
{
  "messages": [
    { "role": "user", "content": "北京今天天气怎么样？" }
  ]
}
```

#### Response

**200 OK** · SSE 流 · 类型：每行一个事件

每条 SSE 事件三段：`id`（可选，UUID hex）、`event`（事件名）、`data`（JSON）。

**事件：`step`**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `step` | string | 是 | agent 步骤名，例如 `model`、`tools` |
| `blocks` | array | 是 | 该步骤产出的内容块列表，元素结构由 LangChain content_blocks 决定 |
| `blocks[].type` | string | 是 | 块类型（`text` / `tool_call` / `tool_result` 等） |

**事件：`done`**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| （无字段） | — | — | 流结束标记；`data: {}` |

**事件：`error`**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `detail` | string | 是 | 异常文本；流已开始故不会触发 HTTP 错误 |

**完整示例**

```
id: 8a3f1c2e...
event: step
data: {"step":"model","blocks":[{"type":"text","text":"正在查询天气..."}]}

id: c12a9b04...
event: step
data: {"step":"tools","blocks":[{"type":"tool_call","name":"get_weather","args":{"city":"北京"}}]}

id: f0d4e512...
event: done
data: {}

```

**4xx / 5xx 错误**

| 状态码 | detail | 触发条件 |
|--------|--------|----------|
| 400 | `messages must not be empty` | `messages` 数组为空 |

> 流中异常：流已经开始后 agent 内部异常不会触发 HTTP 错误，而是以 `event: error` 形式追加到流末尾。

#### Examples

**cURL**

```bash
curl -N -X POST "https://api.example.com/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```

**JavaScript**

```js
const res = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: '你好' }],
  }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
const buffer = { event: '', data: '' };
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value).split('\n')) {
    if (line.startsWith('event: ')) buffer.event = line.slice(7);
    else if (line.startsWith('data: ')) buffer.data = line.slice(6);
    else if (line === '') {
      // 空行 = 一个事件结束
      if (buffer.event === 'step') console.log('STEP:', JSON.parse(buffer.data));
      else if (buffer.event === 'done') console.log('STREAM END');
      else if (buffer.event === 'error') console.error('ERROR:', buffer.data);
      buffer.event = ''; buffer.data = '';
    }
  }
}
```

**Python**

```python
import requests
with requests.post(
    'https://api.example.com/api/chat/stream',
    json={'messages': [{'role': 'user', 'content': '你好'}]},
    stream=True,
) as r:
    for line in r.iter_lines():
        if line:
            print(line.decode('utf-8'))
```

---

## 附录 A TypeScript 类型

> 与后端 Pydantic 模型一一对应。前端可整体复制到 `src/types.ts`。
> 命名约定：保持 `snake_case`（与后端一致；不要转 camelCase，避免维护成本翻倍）。

```ts
// === 认证 ===

export type UserRole = 'user' | 'admin';

export interface UserOut {
  id: number;
  username: string;     // 全局唯一
  email: string;        // 全局唯一
  role: UserRole;
  is_active: boolean;   // false 时无法登录
  created_at: string;   // ISO 8601, UTC, e.g. "2026-06-19T10:30:00Z"
}

export interface RegisterIn {
  username: string;     // 3-50, 仅 [A-Za-z0-9_.\-]
  email: string;        // RFC 5322 email
  password: string;     // 8-128, 必须含字母+数字
}

export interface RegisterOut {
  user_id: number;
  username: string;
  email: string;
  role: UserRole;
}

export interface LoginIn {
  username: string;     // 1-100, 接受 username 或 email
  password: string;     // 1-128
}

export interface TokenPairOut {
  access_token: string;    // JWT, 默认 15 分钟有效
  refresh_token: string;   // JWT, 默认 7 天有效
  token_type: 'bearer';
  expires_in: number;      // 单位: 秒, access_token 剩余秒数
}

export interface LoginOut extends TokenPairOut {
  user: UserOut;
}

export interface ChangePasswordIn {
  old_password: string;    // 1-128
  new_password: string;    // 8-128, 必须含字母+数字
}

export interface DeleteMeIn {
  password: string;        // 1-128
}

export interface VerifyOut {
  valid: true;             // 无效直接 401; 不会返回 false
  user: UserOut;
}

// === 健康 ===

export interface HealthResponse {
  status: 'ok';
}

// === 聊天 ===

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  /** 消息角色；后端默认 `"user"`（不传即 user），且接受任意字符串。
   *  这里只列出常见值；如后端引入新角色，需要同步扩展联合类型。 */
  role?: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];  // 非空
}

export interface ChatResponse {
  reply: string;            // agent 最终回复文本
}

// === SSE 事件（仅 /api/chat/stream） ===

export interface SSEStepBlock {
  type: string;             // 'text' | 'tool_call' | 'tool_result' 等, 由 LangChain 决定
  [k: string]: unknown;     // 其他字段取决于 type
}

export interface SSEStepEvent {
  step: string;             // agent 步骤名, 如 'model' / 'tools'
  blocks: SSEStepBlock[];
}

export type SSEDoneEvent = Record<string, never>;

export interface SSEErrorEvent {
  detail: string;
}

// 解析后的统一事件形态
export type SSEEvent =
  | { event: 'step'; id?: string; data: SSEStepEvent }
  | { event: 'done'; id?: string; data: SSEDoneEvent }
  | { event: 'error'; id?: string; data: SSEErrorEvent };

// === 统一错误响应 ===

export interface ApiError {
  detail: string;           // 人类可读错误描述, 必有
  errors?: Array<{          // 仅在 400 (Pydantic 校验失败) 时出现
    field?: string;
    message: string;
  }>;
}
```

### TypeScript 类型使用提示

- `expires_in` 是**秒**，倒计时用 `(expires_in - 60) * 1000` ms
- `created_at` 是字符串，不是 `Date`；需要 `new Date(s)` 转换
- `UserRole` 是字面量联合类型，可直接用于 switch / 条件渲染
- `SSEEvent` 是判别联合（discriminated union），用 `if (e.event === 'step')` 可自动收窄类型

---

## 附录 B 前端易踩坑

按"踩坑 → 后果 → 正确做法"列出。所有条目都对应源码里的真实行为，不是凭空猜测。

### B.1 `/api/auth/refresh` 用 refresh_token 作 Bearer

- **踩坑**：照搬其他端点拼 `Authorization: Bearer <access_token>` 去 refresh
- **后果**：永远 401，access token 永远刷不出来，用户被踢回登录页
- **正确**：用 **refresh_token** 作 Bearer；详见该端点文档

### B.2 `/api/auth/logout` 不真正撤销 token

- **踩坑**：以为后端把 token 加了黑名单，只调 logout 不清本地
- **后果**：token 在剩余有效期内仍可被复用（直到 access 15 分钟过期）
- **正确**：后端仅做依赖校验，**前端必须自己清掉两个 token**（access + refresh）

### B.3 `/api/auth/login` 防枚举统一文案

- **踩坑**：前端根据 detail 文案区分"用户名错"和"密码错"
- **后果**：账号枚举攻击向量被你主动提供给攻击者
- **正确**：后端三种情况（用户名错 / 密码错 / 账号禁用）都返回 `用户名或密码错误`；前端不要做这种区分

### B.4 `expires_in` 单位是秒不是毫秒

- **踩坑**：`setTimeout(refresh, expires_in)` 写错
- **后果**：登录后 1 秒内就触发 refresh，刷新风暴
- **正确**：`setTimeout(refresh, (expires_in - 60) * 1000)`（提前 60s）

### B.5 `/api/auth/me/password` 同 Authorization 头可塞两 token

- **踩坑**：以为 refresh token 要单独请求 / 单独头
- **后果**：不知道能借改密机会吊销旧 refresh，refresh 泄露后无法即时失效
- **正确**：在 `Authorization: Bearer <access>` 后面追加 refresh token（用同样 Bearer 格式）即可，旧 refresh 会进黑名单

### B.6 `/api/auth/login` 限速按 IP

- **踩坑**：登录按钮不加防抖
- **后果**：用户连点 5 次 → 429 → 1 分钟内无法登录（即便密码对）
- **正确**：UI 上 disable 按钮 + 请求 in-flight 时禁用

### B.7 `/api/chat/stream` 流中异常不返回 HTTP 错误

- **踩坑**：以为流断了就是网络问题，重连
- **后果**：agent 内部异常被忽略，前端以为还在流
- **正确**：监听 `event: error` 事件；该事件表示 agent 抛错，对应 `data.detail` 是异常文本

### B.8 Pydantic `EmailStr` 校验较严

- **踩坑**：以为 `not-an-email` 也能注册
- **后果**：后端 400 + `errors[]`；前端没校验就是脏数据
- **正确**：前端用 HTML5 `<input type="email">` 预校验；后端是权威

### B.9 错误响应 `errors[]` 只在 Pydantic 校验失败（400）时出现

- **踩坑**：以为所有错误都有 `errors[]`
- **后果**：业务错误（401 / 409 / 429）的响应里访问 `errors` 拿到 `undefined`，代码崩
- **正确**：401 / 409 / 429 只读 `detail`；仅 400 需要展开 `errors[]`

### B.10 `/api/chat` 与 `/api/chat/stream` 鉴权缺失

- **踩坑**：以为所有非 `/health` 端点都要 Bearer
- **后果**：在前端 fetch 里硬塞 Authorization，污染请求
- **正确**：这两个聊天端点当前**不校验鉴权**（依赖后端 LLM 配置）；前端不要给它们加 Bearer 头

---

## 附录 C 文档维护说明

- 字段定义来自 `backend/auth/schemas.py`（认证）+ `backend/schemas.py`（聊天、健康）
- Token 有效期来自 `backend/auth/config.py`（`access_token_expire_minutes=15`、`refresh_token_expire_days=7`）
- 限速默认值来自 `backend/auth/config.py`（`login_rate_limit_per_min=5`）
- 修改后端任一字段 / 端点 / 配置后，**必须同步更新本文件**（按 api-documentation-generator 技能走流程）

