import psycopg2

# 数据库配置示例，请复制此文件为db.py并填入实际配置
DB_CONFIG = {
    "host": "localhost",  # 数据库主机地址
    "port": "5432",      # 数据库端口
    "database": "bom_db", # 数据库名称
    "user": "username",   # 数据库用户名
    "password": "password" # 数据库密码
}

def get_connection():
    return psycopg2.connect(**DB_CONFIG)