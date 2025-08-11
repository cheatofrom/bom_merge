#!/bin/bash

# 数据库连接信息
HOST="192.168.1.66"
PORT="7432"
DB="zxb"
USER="root"
PASSWORD="123456"

# 执行文件映射表SQL脚本
PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -d "$DB" -U "$USER" -f file_mappings.sql

echo "文件映射表结构已创建完成"