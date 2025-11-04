import asyncio
import json
import logging
import fnmatch
import sys
import os
import threading
from typing import Optional, Dict, Any, Union
from datetime import timedelta, datetime

# 自定义异常类
class CacheError(Exception):
    """缓存基础异常"""
    pass

class RedisConnectionError(CacheError):
    """Redis连接错误"""
    pass

class CacheOperationError(CacheError):
    """缓存操作错误"""
    pass

# 添加父目录到路径以导入配置
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from redis_config import REDIS_CONFIG, CACHE_EXPIRY, CACHE_PREFIX

# 异步Redis支持
try:
    import aioredis
    ASYNC_REDIS_AVAILABLE = True
except ImportError:
    ASYNC_REDIS_AVAILABLE = False
    logging.warning("aioredis未安装，异步功能将受限")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AsyncCacheService:
    def __init__(self, config=None):
        """初始化异步Redis缓存服务"""
        self.config = config or REDIS_CONFIG
        self.redis_client: Optional[aioredis.Redis] = None
        self._memory_cache = {}
        self._memory_cache_lock = threading.Lock()
        self._initialized = False
    
    async def initialize(self):
        """异步初始化Redis连接"""
        if self._initialized:
            return
        
        if ASYNC_REDIS_AVAILABLE:
            try:
                self.redis_client = aioredis.from_url(
                    f"redis://{self.config['host']}:{self.config['port']}",
                    db=self.config.get('db', 0),
                    password=self.config.get('password'),
                    encoding="utf-8",
                    decode_responses=True
                )
                # 测试连接
                await self.redis_client.ping()
                logger.info(f"异步Redis缓存服务连接成功 - {self.config['host']}:{self.config['port']}")
            except aioredis.ConnectionError as e:
                logger.warning(f"Redis连接错误，将使用内存缓存: {e}")
                self.redis_client = None
            except aioredis.AuthenticationError as e:
                logger.error(f"Redis认证错误: {e}")
                raise RedisConnectionError(f"Redis认证失败: {e}")
            except Exception as e:
                logger.warning(f"异步Redis连接失败，将使用内存缓存: {e}")
                self.redis_client = None
        else:
            logger.warning("aioredis未安装，将使用内存缓存")
            self.redis_client = None
        
        self._initialized = True
    
    def _json_serializer(self, obj):
        """自定义JSON序列化器，处理datetime对象"""
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
    
    async def set(self, key: str, value: Any, expire: int = None, cache_type: str = 'default') -> bool:
        """异步设置缓存"""
        if not self._initialized:
            raise CacheOperationError("缓存服务未初始化，请先调用initialize()")
        
        try:
            if expire is None:
                expire = CACHE_EXPIRY.get(cache_type, CACHE_EXPIRY['default'])
            
            if self.redis_client:
                if isinstance(value, bool):
                    value = json.dumps(value)  # 将布尔值转换为JSON字符串
                elif isinstance(value, (dict, list)):
                    value = json.dumps(value, default=self._json_serializer, ensure_ascii=False)
                result = await self.redis_client.setex(key, expire, value)
                if result:
                    logger.info(f"Redis缓存设置成功: {key}, 过期时间: {expire}秒")
                else:
                    logger.warning(f"Redis缓存设置失败: {key}")
                return result
            else:
                # 使用内存缓存作为fallback
                with self._memory_cache_lock:
                    self._memory_cache[key] = {
                        'value': value,
                        'expiry': datetime.now() + timedelta(seconds=expire),
                        'type': type(value).__name__
                    }
                logger.info(f"内存缓存设置成功: {key}")
                return True
        except aioredis.ConnectionError as e:
            logger.error(f"Redis连接错误 - 键: {key}, 错误: {e}")
            # 回退到内存缓存
            with self._memory_cache_lock:
                self._memory_cache[key] = {
                    'value': value,
                    'expiry': datetime.now() + timedelta(seconds=expire),
                    'type': type(value).__name__
                }
            return True
        except Exception as e:
            logger.error(f"设置缓存失败 - 键: {key}, 错误: {e}")
            raise CacheOperationError(f"设置缓存失败: {e}")
    
    async def get(self, key: str) -> Optional[Any]:
        """异步获取缓存"""
        try:
            if self.redis_client:
                value = await self.redis_client.get(key)
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
                with self._memory_cache_lock:
                    item = self._memory_cache.get(key)
                    if item is not None:
                        # 检查过期
                        if item['expiry'] < datetime.now():
                            del self._memory_cache[key]
                            logger.info(f"内存缓存过期: {key}")
                            return None
                        logger.info(f"内存缓存命中: {key}")
                        return item['value']
                    else:
                        logger.info(f"内存缓存未命中: {key}")
                return None
        except Exception as e:
            logger.error(f"获取缓存失败: {e}")
            return None
    
    async def delete(self, key: str) -> bool:
        """异步删除缓存"""
        try:
            if self.redis_client:
                result = await self.redis_client.delete(key)
                logger.info(f"Redis删除缓存: {key}, 结果: {result}")
                return bool(result)
            else:
                # 内存缓存删除
                with self._memory_cache_lock:
                    if key in self._memory_cache:
                        del self._memory_cache[key]
                        logger.info(f"内存删除缓存: {key}")
                        return True
                return False
        except Exception as e:
            logger.error(f"删除缓存失败 {key}: {e}")
            # 内存缓存fallback
            with self._memory_cache_lock:
                if key in self._memory_cache:
                    del self._memory_cache[key]
                    return True
            return False
    
    async def exists(self, key: str) -> bool:
        """异步检查缓存是否存在"""
        try:
            if self.redis_client:
                return bool(await self.redis_client.exists(key))
            else:
                with self._memory_cache_lock:
                    if key in self._memory_cache:
                        item = self._memory_cache[key]
                        if item['expiry'] < datetime.now():
                            del self._memory_cache[key]
                            return False
                        return True
                return False
        except Exception as e:
            logger.error(f"检查缓存存在性失败: {e}")
            return False
    
    async def clear_pattern(self, pattern: str) -> int:
        """异步清除匹配模式的缓存"""
        try:
            if self.redis_client:
                keys = await self.redis_client.keys(pattern)
                if keys:
                    deleted_count = await self.redis_client.delete(*keys)
                    logger.info(f"Redis清除模式缓存: {pattern}, 匹配键: {len(keys)}, 删除: {deleted_count}")
                    return deleted_count
                else:
                    logger.info(f"Redis清除模式缓存: {pattern}, 未找到匹配的键")
                return 0
            else:
                # 内存缓存的模式匹配
                with self._memory_cache_lock:
                    keys_to_delete = [key for key in self._memory_cache.keys() 
                                    if fnmatch.fnmatch(key, pattern)]
                    for key in keys_to_delete:
                        del self._memory_cache[key]
                    logger.info(f"内存清除模式缓存: {pattern}, 删除: {len(keys_to_delete)}")
                    return len(keys_to_delete)
        except Exception as e:
            logger.error(f"清除模式缓存失败: {e}")
            return 0
    
    async def get_stats(self) -> Dict[str, Any]:
        """异步获取缓存统计信息"""
        try:
            if self.redis_client:
                info = await self.redis_client.info()
                return {
                    'connected_clients': info.get('connected_clients', 0),
                    'used_memory': info.get('used_memory_human', '0B'),
                    'keyspace_hits': info.get('keyspace_hits', 0),
                    'keyspace_misses': info.get('keyspace_misses', 0),
                    'total_commands_processed': info.get('total_commands_processed', 0)
                }
            else:
                with self._memory_cache_lock:
                    valid_keys = sum(1 for item in self._memory_cache.values() 
                                   if item['expiry'] > datetime.now())
                return {
                    'cache_type': 'memory',
                    'total_keys': valid_keys
                }
        except Exception as e:
            logger.error(f"获取缓存统计失败: {e}")
            return {}
    
    # 便捷方法 - 使用预定义的键前缀
    async def set_session(self, session_id: str, data: Any) -> bool:
        """异步设置会话缓存"""
        key = f"{CACHE_PREFIX['session']}{session_id}"
        return await self.set(key, data, cache_type='session')
    
    async def get_session(self, session_id: str) -> Optional[Any]:
        """异步获取会话缓存"""
        key = f"{CACHE_PREFIX['session']}{session_id}"
        return await self.get(key)
    
    async def delete_session(self, session_id: str) -> bool:
        """异步删除会话缓存"""
        key = f"{CACHE_PREFIX['session']}{session_id}"
        return await self.delete(key)
    
    async def set_user_info(self, user_id: str, data: Any) -> bool:
        """异步设置用户信息缓存"""
        key = f"{CACHE_PREFIX['user']}{user_id}"
        return await self.set(key, data, cache_type='user_info')
    
    async def get_user_info(self, user_id: str) -> Optional[Any]:
        """异步获取用户信息缓存"""
        key = f"{CACHE_PREFIX['user']}{user_id}"
        return await self.get(key)
    
    async def delete_user_info(self, user_id: str) -> bool:
        """异步删除用户信息缓存"""
        key = f"{CACHE_PREFIX['user']}{user_id}"
        return await self.delete(key)
    
    async def set_project_data(self, project_id: str, data: Any) -> bool:
        """异步设置项目数据缓存"""
        key = f"{CACHE_PREFIX['project']}{project_id}"
        return await self.set(key, data, cache_type='project_data')
    
    async def get_project_data(self, project_id: str) -> Optional[Any]:
        """异步获取项目数据缓存"""
        key = f"{CACHE_PREFIX['project']}{project_id}"
        return await self.get(key)
    
    async def delete_project_data(self, project_id: str) -> bool:
        """异步删除项目数据缓存"""
        key = f"{CACHE_PREFIX['project']}{project_id}"
        return await self.delete(key)
    
    async def clear_user_sessions(self, user_id: str) -> int:
        """异步清除用户相关会话缓存"""
        pattern = f"{CACHE_PREFIX['session']}{user_id}:*"
        return await self.clear_pattern(pattern)
    
    async def clear_project_data(self, project_id: str) -> int:
        """异步清除项目相关数据缓存"""
        pattern = f"{CACHE_PREFIX['project']}{project_id}:*"
        return await self.clear_pattern(pattern)
    
    async def cleanup_expired_memory_cache(self) -> int:
        """异步清理过期的内存缓存"""
        if not self._memory_cache:
            return 0
        
        expired_count = 0
        current_time = datetime.now()
        
        with self._memory_cache_lock:
            keys_to_delete = [
                key for key, item in self._memory_cache.items()
                if item['expiry'] < current_time
            ]
            
            for key in keys_to_delete:
                del self._memory_cache[key]
                expired_count += 1
        
        if expired_count > 0:
            logger.info(f"清理了 {expired_count} 个过期内存缓存项")
        
        return expired_count
    
    async def get_memory_cache_size(self) -> int:
        """获取当前内存缓存大小"""
        with self._memory_cache_lock:
            return len(self._memory_cache)
    
    async def close(self):
        """关闭缓存服务连接"""
        try:
            if self.redis_client:
                await self.redis_client.close()
                logger.info("Redis连接已关闭")
            
            # 清理内存缓存
            with self._memory_cache_lock:
                self._memory_cache.clear()
            logger.info("内存缓存已清理")
            
            self._initialized = False
            logger.info("缓存服务已关闭")
        except Exception as e:
            logger.error(f"关闭缓存服务时出错: {e}")
            raise

# 全局异步缓存服务实例
cache_service = AsyncCacheService()