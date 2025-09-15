#!/bin/bash

# Redis Docker管理脚本
# 用法: ./redis-manager.sh [start|stop|restart|status|logs|shell]

COMPOSE_FILE="docker-compose.redis.yml"
CONTAINER_NAME="bom_merge_redis"

case "$1" in
    start)
        echo "启动Redis服务..."
        docker-compose -f $COMPOSE_FILE up -d
        echo "Redis服务已启动"
        ;;
    stop)
        echo "停止Redis服务..."
        docker-compose -f $COMPOSE_FILE down
        echo "Redis服务已停止"
        ;;
    restart)
        echo "重启Redis服务..."
        docker-compose -f $COMPOSE_FILE restart
        echo "Redis服务已重启"
        ;;
    status)
        echo "Redis服务状态:"
        docker-compose -f $COMPOSE_FILE ps
        ;;
    logs)
        echo "查看Redis日志:"
        docker-compose -f $COMPOSE_FILE logs -f redis
        ;;
    shell)
        echo "进入Redis命令行:"
        docker exec -it $CONTAINER_NAME redis-cli
        ;;
    health)
        echo "检查Redis健康状态:"
        docker exec $CONTAINER_NAME redis-cli ping
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs|shell|health}"
        echo "  start   - 启动Redis服务"
        echo "  stop    - 停止Redis服务"
        echo "  restart - 重启Redis服务"
        echo "  status  - 查看服务状态"
        echo "  logs    - 查看服务日志"
        echo "  shell   - 进入Redis命令行"
        echo "  health  - 检查健康状态"
        exit 1
        ;;
esac