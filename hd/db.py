import psycopg2

DB_CONFIG = {
    "host": "192.168.1.66",
    "port": "7432",
    "database": "zxb",
    "user": "root",
    "password": "123456"
}

def get_connection():
    return psycopg2.connect(**DB_CONFIG)
