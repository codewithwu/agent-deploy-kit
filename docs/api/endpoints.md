# 后端接口详细参考

> 每个接口独立小节，包含方法、路径、鉴权要求、请求头、请求 / 响应字段、错误码、示例。
> 索引与模块划分见 [README.md](./README.md)。

## 目录

- 健康检查
  - [GET /health](#get-health)
- 智能体聊天
  - [POST /api/chat](#post-apichat)
  - [POST /api/chat/stream](#post-apichatstream)
- 用户认证（`/api/auth`）
  - [POST /api/auth/register](#post-apiauthregister)
  - [POST /api/auth/login](#post-apiauthlogin)
  - [POST /api/auth/logout](#post-apiauthlogout)
  - [POST /api/auth/refresh](#post-apiauthrefresh)
  - [GET /api/auth/verify](#get-apiauthverify)
  - [GET /api/auth/me](#get-apiauthme)
  - [PATCH /api/auth/me/password](#patch-apiauthmepassword)
  - [DELETE /api/auth/me](#delete-apiauthme)

## 通用约定（适用于所有接口）

- **Base URL**：开发期 `http://localhost:8000`
- **Content-Type**：`application/json`（除 SSE 外）
- **CORS**：开发期全开，前端无需特殊处理
- **鉴权**：需鉴权接口必须在请求头加 `Authorization: Bearer <token>`
- **错误**：见 [README.md#通用响应与错误](./README.md#通用响应与错误)
- **时间格式**：`ISO 8601`（如 `2026-06-16T10:30:00Z`）

---

## 健康检查

### GET /health

服务存活探针。启动期会主动加载智能体（`AGENT_NAME` 缺失 / 子包不存在时此调用会失败）。

**鉴权**：否

**响应**：`200 OK`

```json
{ "status": "ok" }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| status | string | 固定为 `"ok"` |

**示例**

```bash
curl http://localhost:8000/health
```

---

## 智能体聊天

> 智能体由 `AGENT_NAME` 环境变量指定（默认 `weather_agent`）。请求体会原样转发给 `agent.invoke` / `agent.stream`。
> 消息顺序即对话顺序；多轮对话需把历史消息全部回传。

### POST /api/chat

同步调用智能体，阻塞至生成最终回复。

**鉴权**：否

**请求体**

```json
{
  "messages": [
    { "role": "user", "content": "北京今天天气怎么样？" }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| messages | array<object> | 是 | 对话历史，可为空数组（空数组时接口返 400） |
| messages[].role | string | 是 | 角色，如 `user` / `assistant` / `system` |
| messages[].content | string | 是 | 消息文本 |

**响应**：`200 OK`

```json
{ "reply": "北京今天晴，气温 25°C。" }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| reply | string | 智能体最后一条消息的 `content`（字符串形式） |

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 400 | `messages must not be empty` | `messages` 为空数组 |
| 500 | `<异常消息>` | 智能体调用 / 处理异常 |

**示例**

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"北京天气"}]}'
```

---

### POST /api/chat/stream

SSE 流式调用智能体，输出中间步骤与最终结束事件。详见 [README.md#流式聊天 SSE 协议](./README.md#流式聊天sse-协议)。

**鉴权**：否

**请求体**：与 `POST /api/chat` 完全一致。

**响应**：`200 OK`，`Content-Type: text/event-stream`，流中持续输出 SSE 事件。

**事件清单**

| 事件 | data | 说明 |
|---|---|---|
| `step` | `{"step": "<name>", "blocks": [...]}` | LangChain 中间步骤；`blocks` 来自该步最后一条消息的 `content_blocks` |
| `done` | `{}` | 正常结束 |
| `error` | `{"detail": "<message>"}` | 流中异常（响应头已发出，仅以事件形式通知） |

每块包含 `event` / 可选 `id`（uuid4 hex）/ `data` 三行，块间空行。

**响应头**

| 头 | 值 |
|---|---|
| Cache-Control | no-store |
| X-Accel-Buffering | no |

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 400 | `messages must not be empty` | `messages` 为空数组 |
| 500 | （以 `error` 事件形式） | 流中智能体异常 |

**前端消费示例**（伪代码）

```ts
const res = await fetch(`${API_BASE}/api/chat/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  // 按 "\n\n" 切块，解析 event / id / data
  // data: 行是 JSON 字符串
}
```

> 实际前端封装见 `frontend/src/lib/api.ts` 的 `streamChat(messages, signal)`，返回 `AsyncGenerator<StreamEvent>`。

---

## 用户认证（`/api/auth`）

> 路由源：`backend/auth/routes.py`，由 `app.include_router(auth_router, prefix="/api/auth")` 挂载。
> Token 签发 / 校验：`backend/auth/security.py`；配置：`backend/auth/config.py`（`.env` 中调整 TTL、Redis、限速等）。

### 公共模型

`UserOut`（公开用户视图，密码相关字段一律不返回）：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer | 用户 ID（自增） |
| username | string | 用户名（3-50 位，`[A-Za-z0-9_.-]`） |
| email | string | 邮箱 |
| role | string | 角色，取值 `user` / `admin` |
| is_active | boolean | 是否启用；软删后为 `false` |
| created_at | string (ISO 8601) | 创建时间 |

`TokenPairOut`：

| 字段 | 类型 | 说明 |
|---|---|---|
| access_token | string | 短期 access token（默认 15 分钟有效） |
| refresh_token | string | 长期 refresh token（默认 7 天有效） |
| token_type | string | 固定 `"bearer"` |
| expires_in | integer | access token 剩余秒数 |

`RegisterOut`：

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id | integer | 新用户 ID |
| username | string | 用户名 |
| email | string | 邮箱 |
| role | string | 固定 `"user"` |

`VerifyOut`：

| 字段 | 类型 | 说明 |
|---|---|---|
| valid | boolean | 固定 `true`（鉴权失败时已 401） |
| user | UserOut | 当前用户信息 |

### POST /api/auth/register

注册新用户，角色固定为 `user`。

**鉴权**：否

**请求体**

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "Secret123"
}
```

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| username | string | 是 | 3-50 位，仅字母 / 数字 / 下划线 / 点 / 连字符 |
| email | string | 是 | 合法邮箱格式 |
| password | string | 是 | 8-128 位，必须含字母 + 数字 |

**响应**：`201 Created`

```json
{
  "user_id": 42,
  "username": "alice",
  "email": "alice@example.com",
  "role": "user"
}
```

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 400 | `参数错误` + `errors` | 字段格式不通过 Pydantic 校验 |
| 409 | `用户名已被使用` | username 冲突 |
| 409 | `邮箱已被使用` | email 冲突 |

**示例**

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"Secret123"}'
```

---

### POST /api/auth/login

登录。`username` 字段兼容「用户名」或「邮箱」。

**鉴权**：否

**限速**：单 IP 每分钟最多 5 次失败尝试，超出返 `429`（内存计数器，进程重启清零）。

**请求体**

```json
{
  "username": "alice",
  "password": "Secret123"
}
```

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| username | string | 是 | 1-100 位 |
| password | string | 是 | 1-128 位 |

**响应**：`200 OK`

```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": 42,
    "username": "alice",
    "email": "alice@example.com",
    "role": "user",
    "is_active": true,
    "created_at": "2026-06-16T10:30:00Z"
  }
}
```

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 400 | `参数错误` + `errors` | 字段缺失 / 长度不合法 |
| 401 | `用户名或密码错误` | 用户不存在 / 密码错 / 账号已停用（统一文案防枚举） |
| 429 | `尝试过于频繁，请稍后再试` | 单 IP 1 分钟内失败次数 ≥ `LOGIN_RATE_LIMIT_PER_MIN`（默认 5） |

**示例**

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"Secret123"}'
```

---

### POST /api/auth/logout

登出。简化实现：仅校验 access token 依赖，不真正吊销 token（access 无 jti）。前端应同时丢弃本地的 access / refresh。

**鉴权**：是（access token）

**请求体**：无

**响应**：`204 No Content`

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 401 | `认证失败` | 缺 / 错 / 过期 access token |

**示例**

```bash
curl -X POST http://localhost:8000/api/auth/logout \
  -H "Authorization: Bearer <access_token>"
```

---

### POST /api/auth/refresh

用 refresh token 换新 access + refresh（rotating）。旧 refresh 进 Redis 黑名单直至其原始过期时间。

**鉴权**：是（refresh token，从 `Authorization: Bearer <...>` 头取）

**请求体**：无

**响应**：`200 OK`

```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 900
}
```

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 401 | `认证失败` | 缺 / 错 / 过期 / 已吊销的 refresh token |

**示例**

```bash
curl -X POST http://localhost:8000/api/auth/refresh \
  -H "Authorization: Bearer <refresh_token>"
```

> 前端建议在 catch 到 401 后自动走 refresh 续签后重放原请求。

---

### GET /api/auth/verify

校验当前 access token 有效性，返用户信息。常用于前端启动 / 刷新页面时确认登录态。

**鉴权**：是（access token）

**请求体**：无

**响应**：`200 OK`

```json
{
  "valid": true,
  "user": {
    "id": 42,
    "username": "alice",
    "email": "alice@example.com",
    "role": "user",
    "is_active": true,
    "created_at": "2026-06-16T10:30:00Z"
  }
}
```

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 401 | `认证失败` | 缺 / 错 / 过期 access token |

**示例**

```bash
curl http://localhost:8000/api/auth/verify \
  -H "Authorization: Bearer <access_token>"
```

---

### GET /api/auth/me

取当前登录用户资料。

**鉴权**：是（access token）

**请求体**：无

**响应**：`200 OK`（`UserOut`）

```json
{
  "id": 42,
  "username": "alice",
  "email": "alice@example.com",
  "role": "user",
  "is_active": true,
  "created_at": "2026-06-16T10:30:00Z"
}
```

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 401 | `认证失败` | 缺 / 错 / 过期 access token |

**示例**

```bash
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

---

### PATCH /api/auth/me/password

修改密码。请求头传 access token。

**鉴权**：是（access token）

**请求体**

```json
{
  "old_password": "Secret123",
  "new_password": "NewSecret456"
}
```

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| old_password | string | 是 | 1-128 位 |
| new_password | string | 是 | 8-128 位，必须含字母 + 数字 |

**响应**：`204 No Content`

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 400 | `参数错误` + `errors` | 字段缺失 / 长度 / 强度不通过 |
| 401 | `认证失败` | 缺 / 错 / 过期 access token |
| 401 | `密码错误` | 旧密码不正确 |

**示例**

```bash
curl -X PATCH http://localhost:8000/api/auth/me/password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"Secret123","new_password":"NewSecret456"}'
```

> 改密**不会**自动吊销当前 refresh token：源码 `backend/auth/routes.py:change_password` 期望从 `Authorization` 头里取 refresh token 与 access 区分，但鉴权依赖已占用该头，实际只能取到 access token，refresh 吊销分支会静默跳过。若需「改密即下线所有设备」，需前端在改密成功后调 `POST /api/auth/logout` + 丢弃本地 refresh，或由后端扩展独立 header。

---

### DELETE /api/auth/me

软删当前账号（`is_active=false`）。账号停用后无法再登录（`InvalidCredentials` 走统一文案），但 access token 在过期前仍能调 `/verify` / `/me`（`get_current_user` 不强制 `is_active`，由前端决定跳转）。

**鉴权**：是（access token）

**请求体**

```json
{ "password": "Secret123" }
```

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| password | string | 是 | 1-128 位 |

**响应**：`204 No Content`

**错误码**

| 状态码 | detail | 触发条件 |
|---|---|---|
| 400 | `参数错误` + `errors` | 字段缺失 / 长度不合法 |
| 401 | `认证失败` | 缺 / 错 / 过期 access token |
| 401 | `密码错误` | 密码不正确 |

**示例**

```bash
curl -X DELETE http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"password":"Secret123"}'
```

---

## 附：环境变量（影响接口行为）

> 来源：`backend/auth/config.py`、`.env`。

| 变量 | 默认值 | 影响 |
|---|---|---|
| `JWT_SECRET` | 必填（≥16 位） | Token 签发 / 校验密钥 |
| `JWT_ALGORITHM` | `HS256` | JWT 算法 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | access token 寿命（分钟） |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | refresh token 寿命（天） |
| `REDIS_URL` | `redis://:158168@localhost:6379/0` | refresh 黑名单存储 |
| `LOGIN_RATE_LIMIT_PER_MIN` | `5` | 单 IP 每分钟登录失败上限 |
| `DATABASE_URL` | 必填 | 同步 DB 连接（迁移） |
| `DATABASE_ASYNC_URL` | 必填 | 异步 DB 连接（auth 业务） |
| `AGENT_NAME` | 必填 | 启动期加载的智能体名 |
