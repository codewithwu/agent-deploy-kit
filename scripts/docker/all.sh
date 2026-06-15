#!/bin/bash

# 所有容器管理脚本

SCRIPT_DIR="$(dirname "$0")"

case "$1" in
    start)
        echo "启动所有容器..."
        bash "$SCRIPT_DIR/redis.sh" start
        bash "$SCRIPT_DIR/pgvector.sh" start
        ;;
    stop)
        echo "停止所有容器..."
        bash "$SCRIPT_DIR/redis.sh" stop
        bash "$SCRIPT_DIR/pgvector.sh" stop
        ;;
    restart)
        echo "重启所有容器..."
        bash "$SCRIPT_DIR/redis.sh" restart
        bash "$SCRIPT_DIR/pgvector.sh" restart
        ;;
    remove)
        echo "删除所有容器和数据卷..."
        bash "$SCRIPT_DIR/redis.sh" remove
        bash "$SCRIPT_DIR/pgvector.sh" remove
        ;;
    status)
        bash "$SCRIPT_DIR/redis.sh" status
        bash "$SCRIPT_DIR/pgvector.sh" status
        ;;
    *)
        echo "用法: $0 {start|stop|restart|remove|status}"
        exit 1
        ;;
esac
