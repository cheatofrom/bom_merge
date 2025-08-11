#!/bin/bash

# 数据库连接信息
DB_HOST="192.168.1.66"
DB_PORT="7432"
DB_NAME="zxb"
DB_USER="root"
DB_PASSWORD="123456"

# 执行SQL脚本
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -f add_source_file_ids_to_merged_projects.sql

echo "已添加source_file_ids字段到merged_projects表"