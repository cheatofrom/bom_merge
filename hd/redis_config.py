# Redis配置文件
# 用于BOM合并项目的Redis连接配置

import os

# Redis连接配置
REDIS_CONFIG = {
    'host': os.getenv('REDIS_HOST', 'localhost'),
    'port': int(os.getenv('REDIS_PORT', 6379)),
    'db': int(os.getenv('REDIS_DB', 0)),
    'password': os.getenv('REDIS_PASSWORD', 'your_redis_password_here'),
    'decode_responses': True,
    'socket_connect_timeout': 5,
    'socket_timeout': 5,
    'retry_on_timeout': True,
    'retry_on_error': [ConnectionError, TimeoutError],
    'health_check_interval': 30
}

# 缓存过期时间配置（秒）
CACHE_EXPIRY = {
    'session': 3600,        # 用户会话缓存 1小时
    'user_info': 1800,      # 用户信息缓存 30分钟
    'project_data': 600,    # 项目数据缓存 10分钟
    'parts_data': 300,      # 零部件数据缓存 5分钟
    'default': 3600         # 默认缓存时间 1小时
}

# 缓存键前缀
CACHE_PREFIX = {
    'session': 'bom:session:',
    'user': 'bom:user:',
    'project': 'bom:project:',
    'parts': 'bom:parts:',
    'temp': 'bom:temp:'
}