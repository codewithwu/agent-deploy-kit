# 用户认证与 JWT 设计

- 日期：2026-06-16
- 范围：新增 `backend/auth/` 子包与配套 schema/路由/服务/依赖；扩展 `User` 模型加 `role`；新建 `user_roles` 关联表；用 Redis 维护 refresh token 黑名单；新增 `init_admin.py` 脚手架与迁移。**不动**前端，不动现有 `/health` 与 `/api/chat*` 同步接口。

## 背景与目标

当前 `backend/models/user.py` 只有最小用户字段（username/email/hashed_password/is_active/created_at/updated_at），**无 role 字段、无认证模块**。`pyproject.toml` 已含 `pyjwt` 与 `pwdlib[argon2]`，已有 Postgres + alembic 基础设施，但 `backend/alembic/versions/` 还是空的。

目标：
- 提供注册 / 登录 / 退出 / 注销 / 改密 / 刷新 token / 验证 token / 查询 me 共 8 个端点。
- 用 JWT 双 token（access + refresh），refresh token 通过 Redis 黑名单实现"退出登录即失效"。
- 用户表加 `role` 字段并建 `user_roles` 关联表，支持后续"一用户多角色/细粒度权限"扩展。
- 设计保持简洁，不引入超出需求的能力（YAGNI）。

设计原则：
- 模块边界清晰：`backend/auth/` 自治，不动现有 `backend/main.py` 同步接口风格。
- 业务逻辑（`service.py`）不依赖 FastAPI，便于单测。
- 启动期 fail-fast：JWT secret / Redis 不可用时直接崩。
- 默认 role 为 `user`，admin 通过 init 脚本手动创建。

## 目录与文件

```
backend/
├── main.py                       # 修改：include_router(auth_router, prefix="/api/auth")
├── models/
│   ├── __init__.py               # 修改：导出 User, UserRole
│   └── user.py                   # 修改：加 role 字段；新建关联表 UserRole
├── db/                           # 不动（async/sync session 已就绪）
└── auth/                         # 新增
    ├── __init__.py               # 导出 router
    ├── config.py                 # pydantic-settings 读 JWT_SECRET / TTL / Redis URL
    ├── redis_client.py           # async redis 连接池
    ├── security.py               # pwdlib 哈希、JWT 签发/解码、黑名单读删
    ├── deps.py                   # FastAPI 依赖：get_current_user、require_role
    ├── schemas.py                # Register/Login/Token/... Pydantic 模型
    ├── service.py                # 注册/登录/退出/注销/改密 的纯业务逻辑
    └── routes.py                 # FastAPI 路由层

backend/alembic/versions/
└── 2026_06_16_xxxxxx_add_role_and_user_roles.py   # 新增：autogenerate + 手工审

scripts/
├── README.md                     # 追加 init_admin 脚本用法
└── init_admin.py                 # 新增：幂等创建 admin 账号

tests/
├── conftest.py                   # 不动
├── test_backend.py               # 不动
└── test_auth.py                  # 新增：httpx AsyncClient + DB/Redis fixture

pyproject.toml                    # 修改：dependencies 加 redis[hiredis]>=5.0
.env.example / .env               # 修改：补 JWT_SECRET / TTL / REDIS_* 变量
code_map.md                       # 修改：登记新增模块与脚本
```

不动：`agents/` 全部内容、`backend/schemas.py`（chat 相关）、`backend/agent_loader.py`、`docker/`、`frontend/`、现有 `tests/test_backend.py` 与 `tests/conftest.py`。

## 数据模型

### `users`（扩展现有 `User`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `Integer` | PK, autoincrement | 不变 |
| `username` | `String(50)` | unique, not null | 不变 |
| `email` | `String(100)` | unique, not null | 不变 |
| `hashed_password` | `String` | not null | 不变 |
| `role` | `String(20)` | not null, default `"user"`, CheckConstraint `IN ('user','admin')` | **新增** |
| `is_active` | `Boolean` | not null, default true | 注销时置 false |
| `created_at` / `updated_at` | `DateTime` | server default + onupdate | 不变 |

### `user_roles`（新建关联表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `user_id` | `Integer` | FK → users.id ON DELETE CASCADE, PK(联合) | |
| `role` | `String(20)` | not null, PK(联合), CheckConstraint 同上 | |
| `granted_at` | `DateTime` | server default now() | |

注册时同时 `INSERT users(role=...)` 与 `INSERT user_roles(user_id, role)`，保持镜像。后续扩展多角色/细粒度权限只需在 `user_roles` 上 INSERT，**不动** `users` 表结构。

迁移用 `alembic revision --autogenerate -m "add role and user_roles"` 生成；手工审后：
- 给存量 `users` 写回 `user_roles` 镜像（data migration）。
- 加 CheckConstraint 限枚举。

### 黑名单

**只在 Redis**：`SET blacklist:refresh:{jti} 1 EX <remaining_ttl>`，TTL = refresh_token 剩余生命周期。Redis 不可用时签发/刷新/验证/退出全部 fail-closed。

## 接口契约

所有路径前缀 `/api/auth`。错误统一格式：`{"detail": "..."}`，Pydantic 校验失败返 400（自定义异常处理器把 422 转 400 + 字段错误列表）。

| 方法 | 路径 | 鉴权 | 入参 | 出参 | 错误 |
|------|------|------|------|------|------|
| POST | `/register` | 无 | `{username, email, password}` | 201 `{user_id, username, email, role}` | 400 校验失败 / 409 username 或 email 已存在 |
| POST | `/login` | 无 | `{username, password}`（username 字段同时接受 username 或 email） | 200 `{access_token, refresh_token, token_type:"bearer", expires_in, user:{id,username,email,role}}` | 401 用户名或密码错误（统一文案防枚举） |
| POST | `/logout` | Bearer | 空 | 204 | 401 token 无效 |
| POST | `/refresh` | Bearer(refresh) | 空 | 200 `{access_token, refresh_token, expires_in}`（rotating refresh：返回新的 refresh，旧 refresh 进黑名单） | 401 refresh 失效/被吊销 |
| GET | `/verify` | Bearer(access) | 空 | 200 `{valid:true, user:{id,username,email,role,is_active}}`（`is_active=false` 时仍返 200 但 `valid` 维持 true，由前端看 `is_active` 字段决定跳转） | 401 token 失效/被吊销 |
| GET | `/me` | Bearer | 空 | 200 `{id,username,email,role,is_active,created_at}` | 401 |
| PATCH | `/me/password` | Bearer | `{old_password, new_password}` | 204 | 400 校验 / 401 旧密码错 |
| DELETE | `/me` | Bearer | `{password}`（body） | 204（软删：is_active=false） | 401 密码错 |

### 关键约定

- **退出 = 当前会话失效**：仅把当前 refresh 的 `jti` 写 Redis 黑名单；同一用户的其他设备不受影响。
- **注销 = 软删**：`is_active=false`；同 username/email 保留唯一约束，因此**已注销用户名不可重注册**（首版如此，不做释放期）。`/me` 仍可访问但返 `is_active:false`，已签发 token 立即失效（登出时 jti 写黑名单）。
- **改密 = 吊销当前 refresh**：只吊销本次请求对应的 refresh jti，**不批量**作废其他设备；响应体可带"其他设备需重新登录"提示。批量吊销需要"按 user_id 维度"管理 token 版本，留待后续 `ver` 字段落地。
- **Token 字段**：
  - access payload：`{sub: user_id, type: "access", iat, exp}`
  - refresh payload：`{sub: user_id, type: "refresh", jti, iat, exp}`（`jti` 用 `uuid4().hex`）
- **TTL 默认**（`.env` 可覆盖）：`ACCESS_TOKEN_EXPIRE_MINUTES=15`、`REFRESH_TOKEN_EXPIRE_DAYS=7`。
- **密码强度**：≥8 位、必须含字母+数字（Pydantic field validator）。
- **响应模型不返回密码相关字段**：`UserOut` 显式列出字段，不用 `from_attributes` 全反射。

## 组件

### `backend/auth/config.py`

`pydantic-settings.BaseSettings` 读 `JWT_SECRET`、`JWT_ALGORITHM`（默认 `HS256`）、`ACCESS_TOKEN_EXPIRE_MINUTES`、`REFRESH_TOKEN_EXPIRE_DAYS`、`REDIS_URL`、`LOGIN_RATE_LIMIT_PER_MIN`。`JWT_SECRET` 缺失 → 启动期 `RuntimeError`。

### `backend/auth/redis_client.py`

模块级 `redis.asyncio.from_url(REDIS_URL, decode_responses=True)`，导出 `get_redis() -> Redis` 供依赖注入用。启动期 `await redis.ping()` 失败 → `RuntimeError`。

### `backend/auth/security.py`

- `hash_password(plain: str) -> str` / `verify_password(plain: str, hashed: str) -> bool`：pwdlib + Argon2PasswordHasher。
- `create_access_token(user_id: int) -> str` / `create_refresh_token(user_id: int) -> tuple[str, str]`：返回 (token, jti)。
- `decode_token(token: str, expected_type: str) -> dict`：验签 + 校验 type + 校验 exp，失败抛 `TokenError`（routes 层转 401）。
- `is_refresh_blacklisted(jti: str) -> bool` / `blacklist_refresh(jti: str, ttl_seconds: int) -> None`：Redis 读写。

### `backend/auth/deps.py`

- `get_current_user(authorization: Annotated[str | None, Header()] = None, db: AsyncSession = Depends(get_async_db)) -> User`：从 `Authorization: Bearer <token>` 抽 access token，解码，**不**强制 `is_active`（软删用户仍可调 `/me` 看到 `is_active:false` 提示前端跳登录）。路由层根据需要在 `/verify` 内自行做 is_active 校验。
- `require_role(*allowed: str)`：依赖工厂，返回闭包，闭包内 `user.role not in allowed` → 403。

### `backend/auth/service.py`

纯业务函数，输入 Pydantic 模型 + session/redis，返领域结果或抛业务异常（`UsernameTaken` / `EmailTaken` / `InvalidCredentials` / `InvalidToken` / `UserInactive` / `WrongPassword`）。**不**导入 FastAPI。

### `backend/auth/routes.py`

FastAPI 路由层，依赖注入 + service 调用 + 把业务异常映射到 `HTTPException`。

### `backend/main.py` 修改

```python
# 顶部追加
from backend.auth import router as auth_router
# ...
app.include_router(auth_router, prefix="/api/auth")
```

## 错误处理

| 场景 | 处理 |
|------|------|
| Pydantic 字段校验失败 | 自定义 `RequestValidationError` 处理器统一返 `400 {detail, errors}` |
| `UsernameTaken` / `EmailTaken` | `409 {detail: "用户名已被使用"}` 或 `"邮箱已被使用"` |
| `InvalidCredentials` | `401 {detail: "用户名或密码错误"}`（统一文案防枚举） |
| `InvalidToken` / 黑名单命中 | `401 {detail: "认证失败"}` |
| `UserInactive` | 登录路径返 `401 {detail: "用户名或密码错误"}`（与普通错一致防枚举）；`/verify` 看到 `is_active=false` 不抛错，返 200 让前端处理 |
| `WrongPassword`（改密/注销时） | `401 {detail: "密码错误"}` |
| Redis 不可用 | `500 {detail: "服务暂不可用"}` + `logger.exception` |
| 登录限速触发 | `429 {detail: "尝试过于频繁，请稍后再试"}` |

登录限速：内存 `dict[ip, deque[timestamp]]`，5 次/分钟超限返 429。多 worker 下不共享，留作"多 worker 时升级到 Redis" 的未来优化。

## 安全约束

- JWT secret 仅 `JWT_SECRET` 单密钥（HS256），不区分 access/refresh，简化配置。
- 密码字段不进入任何 response model；`UserOut` 显式字段集。
- 启动期：`JWT_SECRET` 缺失 / Redis ping 失败 → `RuntimeError`，进程退出。
- CORS 不动（开发期 `allow_origins=["*"]`）。
- 错误信息不泄露内部细节（DB 错误统一 `"服务异常"`）。

## 数据流（典型路径）

### 注册

```
POST /api/auth/register {username, email, password}
  → service.register()
      ├─ Pydantic 校验：长度/字符集/唯一性检查（username/email 重复 → 409）
      ├─ hash_password(password)
      ├─ INSERT users (role='user') + INSERT user_roles (user_id, role='user')
      └─ return UserOut
  ← 201 {user_id, username, email, role}
```

### 登录

```
POST /api/auth/login {username, password}
  → 限速检查 (in-memory)
  → service.login()
      ├─ SELECT user WHERE (username=:u OR email=:u) AND is_active=true
      ├─ verify_password  → 失败抛 InvalidCredentials
      ├─ create_access_token + create_refresh_token
      └─ return {access_token, refresh_token, expires_in, user}
  ← 200
```

### 退出

```
POST /api/auth/logout (Authorization: Bearer <refresh>)
  → get_current_user 验签 + type=refresh
  → blacklist_refresh(jti, ttl)
  ← 204
```

### 改密

```
PATCH /api/auth/me/password {old_password, new_password}
  → get_current_user
  → service.change_password()
      ├─ verify old_password  → 失败 401
      ├─ hash new_password + UPDATE users.hashed_password
      └─ blacklist_refresh(current_jti)  // 当前会话失效
  ← 204
```

## 验证标准

1. `uv run ruff format .` 无变更（或仅 auth 子包新文件）。
2. `uv run ruff check --fix .` 全过。
3. `uv run mypy .` 全过（`service.py` 公共函数 100% 类型注解）。
4. `uv run pytest` 全部测试通过，包含：
   - 现有 `tests/test_backend.py` 与 `tests/test_agent_loader.py`（**不被破坏**）。
   - 新增 `tests/test_auth.py`（httpx AsyncClient + lifespan + DB/Redis fixture）：
     - `test_register_success`
     - `test_register_duplicate_username_409`
     - `test_register_duplicate_email_409`
     - `test_register_weak_password_400`
     - `test_register_invalid_email_400`
     - `test_login_success_returns_tokens`
     - `test_login_wrong_password_401`
     - `test_login_unknown_user_same_message_401`
     - `test_login_inactive_user_401`
     - `test_login_rate_limit_429`
     - `test_verify_access_token_ok`
     - `test_verify_expired_token_401`
     - `test_refresh_rotates_token`
     - `test_refresh_reuse_blacklisted_401`
     - `test_logout_blacklists_refresh`
     - `test_change_password_invalidates_current_refresh`
     - `test_change_password_wrong_old_401`
     - `test_delete_me_soft_deletes`
     - `test_deleted_user_cannot_login`
     - `test_require_role_admin_403_for_user`
5. 手工烟测：
   - `bash scripts/docker/pgvector.sh start` + `bash scripts/docker/redis.sh start`
   - `uv run alembic upgrade head`
   - `uv run python scripts/init_admin.py admin admin@example.com Admin12345`
   - `uv run uvicorn backend.main:app --reload`
   - curl 注册 → 登录 → 调 `/api/auth/me` → 改密 → 用旧 refresh 调 `/api/auth/refresh` 期望 401 → 注销 → 登录期望 401。

## 范围外（明确不做）

- 不做邮件验证、找回密码、第三方登录。
- 不做 admin 后台（管理用户列表/重置密码）。`init_admin.py` 是 CLI 命令而非 API。
- 不做 token 批量吊销（按 `ver` 字段），首版只吊销当前会话。
- 不做 refresh token 持久化到 DB（无 DB 表），只用 Redis 黑名单。
- 不写前端代码（前端对接是后续 plan）。
- 不做国际化 / 错误码常量抽取（首版中文 + 自由字符串）。
- 不引入 fastapi-users / authx 等第三方库。
- 不修改 CORS 配置。
- 不重命名或迁移现有 chat 接口（`/api/chat`、`/api/chat/stream`）到 async。

## 后续可考虑

- 改密批量吊销（`ver` 字段 + Redis `ver:{user_id}`）。
- 多角色 / 资源级权限（在 `user_roles` 之上引入 `permissions` 表）。
- 登录限速升级到 Redis（多 worker 共享）。
- 把现有 chat 接口迁移到 async（消除 sync/async 双轨）。
- refresh token 入库（审计 / "显示我的活跃会话" 功能）。
- admin 后台 API（CRUD 用户）。
