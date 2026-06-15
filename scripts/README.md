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
