#!/bin/bash

# 数据库连接信息
HOST="192.168.1.66"
PORT="7432"
DB="zxb"
USER="root"
PASSWORD="123456"

# 执行合并项目表SQL脚本
PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -d "$DB" -U "$USER" -f merged_projects.sql

echo "合并项目相关表结构已创建完成"
