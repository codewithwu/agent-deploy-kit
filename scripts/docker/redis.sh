#!/bin/bash

# Redis 容器管理脚本

COMPOSE_DIR="$(dirname "$0")/../../docker/redis"

case "$1" in
    start)
        echo "启动 Redis..."
        docker compose -f "$COMPOSE_DIR/docker-compose.yml" up -d
        ;;
    stop)
        echo "停止 Redis..."
        docker compose -f "$COMPOSE_DIR/docker-compose.yml" down
        ;;
    restart)
        echo "重启 Redis..."
        docker compose -f "$COMPOSE_DIR/docker-compose.yml" restart
        ;;
    remove)
        echo "删除 Redis 容器和数据卷..."
        docker compose -f "$COMPOSE_DIR/docker-compose.yml" down -v
        ;;
    status)
        docker compose -f "$COMPOSE_DIR/docker-compose.yml" ps
        ;;
    logs)
        docker compose -f "$COMPOSE_DIR/docker-compose.yml" logs -f
        ;;
    *)
        echo "用法: $0 {start|stop|restart|remove|status|logs}"
        exit 1
        ;;
esac
