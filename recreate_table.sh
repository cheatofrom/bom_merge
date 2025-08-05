#!/bin/bash

# 数据库连接信息
HOST="192.168.1.66"
PORT="7432"
DB="zxb"
USER="root"
PASSWORD="123456"

# 执行零件库表SQL脚本
PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -d "$DB" -U "$USER" -f recreate_parts_library.sql

# 执行项目备注表SQL脚本
PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -d "$DB" -U "$USER" -f recreate_project_notes.sql

echo "所有表结构已重新创建完成"