import redis
import json
import logging
from typing import Optional, Dict, Any
from datetime import timedelta, datetime
import sys
import os

# 添加父目录到路径以导入配置
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from redis_config import REDIS_CONFIG, CACHE_EXPIRY, CACHE_PREFIX

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CacheService:
    def __init__(self, config=None):
        """初始化Redis缓存服务"""
        self.config = config or REDIS_CONFIG
        try:
            self.redis_client = redis.Redis(**self.config)
            # 测试连接
            self.redis_client.ping()
            logger.info(f"Redis缓存服务连接成功 - {self.config['host']}:{self.config['port']}")
        except Exception as e:
            logger.warning(f"Redis连接失败，将使用内存缓存: {e}")
            self.redis_client = None
            self._memory_cache = {}
    
    def _json_serializer(self, obj):
        """自定义JSON序列化器，处理datetime对象"""
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
    
    def set(self, key: str, value: Any, expire: int = None, cache_type: str = 'default') -> bool:
        """设置缓存"""
        try:
            if expire is None:
                expire = CACHE_EXPIRY.get(cache_type, CACHE_EXPIRY['default'])
            
            if self.redis_client:
                if isinstance(value, bool):
                    value = json.dumps(value)  # 将布尔值转换为JSON字符串
                elif isinstance(value, (dict, list)):
                    value = json.dumps(value, default=self._json_serializer, ensure_ascii=False)
                result = self.redis_client.setex(key, expire, value)
                if result:
                    logger.info(f"Redis缓存设置成功: {key}, 过期时间: {expire}秒")
                else:
                    logger.warning(f"Redis缓存设置失败: {key}")
                return result
            else:
                # 使用内存缓存作为fallback
                self._memory_cache[key] = value
                logger.info(f"内存缓存设置成功: {key}")
                return True
        except Exception as e:
            logger.error(f"设置缓存失败: {e}")
            return False
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        try:
            if self.redis_client:
                value = self.redis_client.get(key)
                if value:
                    logger.info(f"缓存命中: {key}")
                    try:
                        return json.loads(value)
                    except json.JSONDecodeError:
                        return value
                else:
                    logger.info(f"缓存未命中: {key}")
                return None
            else:
                # 使用内存缓存作为fallback
                result = self._memory_cache.get(key)
                if result is not None:
                    logger.info(f"内存缓存命中: {key}")
                else:
                    logger.info(f"内存缓存未命中: {key}")
                return result
        except Exception as e:
            logger.error(f"获取缓存失败: {e}")
            return None
    
    def delete(self, key: str) -> bool:
        """删除缓存"""
        try:
            if self.redis_client:
                result = self.redis_client.delete(key)
                logger.debug(f"Redis删除缓存: {key}, 结果: {result}")
                return bool(result)
            else:
                # 内存缓存删除
                if key in self._memory_cache:
                    del self._memory_cache[key]
                    logger.debug(f"内存删除缓存: {key}")
                    return True
                return False
        except Exception as e:
            logger.error(f"删除缓存失败 {key}: {e}")
            # 内存缓存fallback
            if key in self._memory_cache:
                del self._memory_cache[key]
                return True
            return False
    
    def exists(self, key: str) -> bool:
        """检查缓存是否存在"""
        try:
            if self.redis_client:
                return bool(self.redis_client.exists(key))
            else:
                return key in self._memory_cache
        except Exception as e:
            logger.error(f"检查缓存存在性失败: {e}")
            return False
    
    def clear_pattern(self, pattern: str) -> int:
        """清除匹配模式的缓存"""
        try:
            if self.redis_client:
                keys = self.redis_client.keys(pattern)
                if keys:
                    return self.redis_client.delete(*keys)
                return 0
            else:
                # 内存缓存的模式匹配
                import fnmatch
                keys_to_delete = [key for key in self._memory_cache.keys() 
                                if fnmatch.fnmatch(key, pattern)]
                for key in keys_to_delete:
                    del self._memory_cache[key]
                return len(keys_to_delete)
        except Exception as e:
            logger.error(f"清除模式缓存失败: {e}")
            return 0
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        try:
            if self.redis_client:
                info = self.redis_client.info()
                return {
                    'connected_clients': info.get('connected_clients', 0),
                    'used_memory': info.get('used_memory_human', '0B'),
                    'keyspace_hits': info.get('keyspace_hits', 0),
                    'keyspace_misses': info.get('keyspace_misses', 0),
                    'total_commands_processed': info.get('total_commands_processed', 0)
                }
            else:
                return {
                    'cache_type': 'memory',
                    'total_keys': len(self._memory_cache)
                }
        except Exception as e:
            logger.error(f"获取缓存统计失败: {e}")
            return {}
    
    # 便捷方法 - 使用预定义的键前缀
    def set_session(self, session_id: str, data: Any) -> bool:
        """设置会话缓存"""
        key = f"{CACHE_PREFIX['session']}{session_id}"
        return self.set(key, data, cache_type='session')
    
    def get_session(self, session_id: str) -> Optional[Any]:
        """获取会话缓存"""
        key = f"{CACHE_PREFIX['session']}{session_id}"
        return self.get(key)
    
    def set_user_info(self, user_id: str, data: Any) -> bool:
        """设置用户信息缓存"""
        key = f"{CACHE_PREFIX['user']}{user_id}"
        return self.set(key, data, cache_type='user_info')
    
    def get_user_info(self, user_id: str) -> Optional[Any]:
        """获取用户信息缓存"""
        key = f"{CACHE_PREFIX['user']}{user_id}"
        return self.get(key)
    
    def set_project_data(self, project_id: str, data: Any) -> bool:
        """设置项目数据缓存"""
        key = f"{CACHE_PREFIX['project']}{project_id}"
        return self.set(key, data, cache_type='project_data')
    
    def get_project_data(self, project_id: str) -> Optional[Any]:
        """获取项目数据缓存"""
        key = f"{CACHE_PREFIX['project']}{project_id}"
        return self.get(key)

# 全局缓存服务实例
cache_service = CacheService()