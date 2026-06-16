# 后端接口索引

> 用途：前端开发新功能时，先看本文件了解后端提供了哪些接口。
> 详细字段、请求/响应示例、错误码请看 [endpoints.md](./endpoints.md)。
> 维护：新增 / 修改 / 废弃接口时同步更新本索引与详细参考。

## 基础信息

- **服务名**：Weather Agent API
- **版本**：`0.1.0`（见 `backend/main.py` 的 `FastAPI(title=..., version=...)`）
- **Base URL**：开发期 `http://localhost:8000`（前端通过 `VITE_API_BASE` 覆盖）
- **OpenAPI 文档**：`/docs`（Swagger UI）、`/openapi.json`
- **数据格式**：`application/json`（除 SSE 外）；SSE 端点 `text/event-stream`
- **CORS**：开发期全开（`allow_origins=["*"]`、`allow_methods=["*"]`、`allow_headers=["*"]`）

## 鉴权约定

| 项 | 约定 |
|---|---|
| Token 类型 | JWT，HS256，密钥从 `.env` 的 `JWT_SECRET` 读 |
| Access token 有效期 | 15 分钟（`ACCESS_TOKEN_EXPIRE_MINUTES`） |
| Refresh token 有效期 | 7 天（`REFRESH_TOKEN_EXPIRE_DAYS`） |
| 传递方式 | `Authorization: Bearer <access_token>` |
| 续签 | access 过期后调 `POST /api/auth/refresh`，header 放 refresh token 换新 access + refresh（rotating） |
| 鉴权失败 | 统一 `401 { "detail": "认证失败" }`（`backend/auth/security.TokenError` → 全局处理器） |
| 角色守卫 | 后端用 `require_role(...)` 依赖；当前路由未挂载角色守卫，预留接口 |

## 通用响应与错误

| 场景 | 状态码 | 响应体 |
|---|---|---|
| 正常 | 2xx | 业务响应体（见各接口） |
| 请求体校验失败 | 400 | `{"detail": "参数错误", "errors": [...]}`（Pydantic 422 → 全局处理器转 400） |
| 鉴权失败 | 401 | `{"detail": "认证失败"}` |
| 资源冲突（用户名/邮箱已存在） | 409 | `{"detail": "..."}` |
| 登录限速 | 429 | `{"detail": "尝试过于频繁，请稍后再试"}` |
| 业务异常 | 4xx / 5xx | `{"detail": "..."}` |

## 模块清单

| 模块 | 前缀 | 简介 |
|---|---|---|
| 健康检查 | `/health` | 服务存活探针 |
| 智能体聊天 | `/api/chat`、`/api/chat/stream` | 同步 / SSE 流式调用 LangChain 智能体 |
| 用户认证 | `/api/auth/*` | 注册、登录、改密、注销、Token 刷新等共 8 个端点 |

## 完整接口列表

### 健康检查

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/health` | 否 | 服务存活探针，返回 `{"status": "ok"}` |

### 智能体聊天

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/chat` | 否 | 同步调用智能体，返最终回复字符串 |
| POST | `/api/chat/stream` | 否 | SSE 流式输出中间步骤与结束事件 |

### 用户认证（`/api/auth`）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/auth/register` | 否 | 注册新用户，默认角色 `user`，返 201 + 公开用户信息 |
| POST | `/api/auth/login` | 否 | 登录，`username` 字段兼容用户名或邮箱；返 access + refresh + 用户信息；单 IP 每分钟 5 次限速 |
| POST | `/api/auth/logout` | 是（access） | 依赖鉴权即视为登出，返 204（access 无 jti，仅校验依赖） |
| POST | `/api/auth/refresh` | 是（refresh） | header 放 refresh token，旋转签发新 access + refresh，旧 refresh 进 Redis 黑名单 |
| GET | `/api/auth/verify` | 是（access） | 校验 access token 有效性，返 `{valid, user}` |
| GET | `/api/auth/me` | 是（access） | 取当前登录用户的公开资料 |
| PATCH | `/api/auth/me/password` | 是（access） | 改密；若 header 携带 refresh token 会同时吊销它 |
| DELETE | `/api/auth/me` | 是（access） | 软删当前账号（`is_active=false`），需校验密码 |

> 鉴权列里的「是（access）」= 用 access token；「是（refresh）」= 用 refresh token（见接口详情）。

## 流式聊天（SSE）协议

`POST /api/chat/stream` 按 `text/event-stream` 输出三类事件，每块格式：

```
event: <name>
id: <uuid>
data: <json>
<空行>
```

| 事件 | data 字段 | 触发时机 |
|---|---|---|
| `step` | `{"step": "<langchain_step>", "blocks": [...]}` | LangChain 中间步骤（model / tools 等），`blocks` 来自消息 `content_blocks` |
| `done` | `{}` | 正常结束 |
| `error` | `{"detail": "<message>"}` | 流中异常（响应头已发出，不会再 raise） |

响应头：`Cache-Control: no-store`、`X-Accel-Buffering: no`。

## 详细参考

每个接口的请求 / 响应字段、示例、错误码见 [endpoints.md](./endpoints.md)。
