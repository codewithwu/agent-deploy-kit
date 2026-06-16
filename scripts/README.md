# 脚本目录

存放项目各类自动化脚本。

## 目录结构

```
scripts/
├── docker/                 # Docker 容器管理脚本
│   ├── all.sh              # 所有容器管理
│   ├── redis.sh            # Redis 容器管理
│   └── pgvector.sh         # pgvector 容器管理
```

## Docker 脚本用法

### 单个容器管理

```bash
# Redis
./scripts/docker/redis.sh start      # 启动
./scripts/docker/redis.sh stop       # 停止
./scripts/docker/redis.sh restart    # 重启
./scripts/docker/redis.sh remove     # 删除容器和数据卷
./scripts/docker/redis.sh status     # 查看状态
./scripts/docker/redis.sh logs       # 查看日志

# pgvector
./scripts/docker/pgvector.sh start
./scripts/docker/pgvector.sh stop
```

### 所有容器管理

```bash
./scripts/docker/all.sh start        # 启动所有
./scripts/docker/all.sh stop         # 停止所有
./scripts/docker/all.sh restart      # 重启所有
./scripts/docker/all.sh remove       # 删除所有
./scripts/docker/all.sh status       # 查看所有状态
```

## init_admin.py

创建/更新一个 admin 账号（开发期与本地烟测用）：

```bash
uv run python scripts/init_admin.py <username> <email> <password>
# 或交互输入密码
uv run python scripts/init_admin.py <username> <email>
```

- 幂等：username 已存在 + 无 `--force` → 报错退出（code 2）。
- `--force` 时把现有用户角色置为 `admin`、重置密码、改 email。
- 生产慎用。
