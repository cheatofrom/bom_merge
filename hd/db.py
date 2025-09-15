import psycopg2
from psycopg2 import pool
import threading
from contextlib import contextmanager, asynccontextmanager
import asyncpg
import asyncio
import logging
import time
from typing import Optional

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_CONFIG = {
    "host": "192.168.1.66",
    "port": "7432",
    "database": "zxb",
    "user": "root",
    "password": "123456"
}

# 全局连接池变量
connection_pool = None
pool_lock = threading.Lock()

def get_connection_pool():
    """获取数据库连接池，使用单例模式确保只创建一个连接池"""
    global connection_pool
    if connection_pool is None:
        with pool_lock:
            if connection_pool is None:
                try:
                    connection_pool = psycopg2.pool.ThreadedConnectionPool(
                        minconn=5,   # 最小连接数
                        maxconn=50,  # 最大连接数，增加以应对高并发
                        **DB_CONFIG
                    )
                    logger.info(f"数据库连接池创建成功，最小连接数: 5, 最大连接数: 50")
                    print("数据库连接池创建成功")
                except Exception as e:
                    print(f"创建数据库连接池失败: {e}")
                    raise
    return connection_pool

def check_connection_health(conn) -> bool:
    """检查数据库连接的健康状态"""
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True
    except Exception as e:
        logger.warning(f"连接健康检查失败: {e}")
        return False

def get_connection():
    """从连接池获取数据库连接（带健康检查和自动恢复）"""
    pool = get_connection_pool()
    max_retries = 3
    retry_delay = 1  # 秒
    
    for attempt in range(max_retries):
        try:
            conn = pool.getconn()
            if conn:
                # 检查连接健康状态
                if check_connection_health(conn):
                    return conn
                else:
                    # 连接不健康，关闭并重试
                    logger.warning(f"连接不健康，尝试重新获取连接 (尝试 {attempt + 1}/{max_retries})")
                    try:
                        conn.close()
                    except:
                        pass
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay)
                        continue
            else:
                raise Exception("无法从连接池获取连接")
        except Exception as e:
            logger.error(f"获取数据库连接失败 (尝试 {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                continue
            raise
    
    raise Exception(f"经过 {max_retries} 次尝试后仍无法获取健康的数据库连接")

def return_connection(conn):
    """将连接返回到连接池"""
    if conn:
        pool = get_connection_pool()
        pool.putconn(conn)

@contextmanager
def get_db_connection():
    """上下文管理器，自动管理数据库连接的获取和释放"""
    conn = None
    try:
        conn = get_connection()
        yield conn
    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            return_connection(conn)

def get_pool_status() -> dict:
    """获取连接池状态信息"""
    pool = get_connection_pool()
    try:
        # 获取连接池的基本信息
        status = {
            "pool_created": pool is not None,
            "min_connections": 5,
            "max_connections": 50,
            "timestamp": time.time()
        }
        
        # 尝试获取连接池的详细状态（如果可用）
        if hasattr(pool, '_pool'):
            status["available_connections"] = len(pool._pool)
        
        return status
    except Exception as e:
        logger.error(f"获取连接池状态失败: {e}")
        return {"error": str(e), "timestamp": time.time()}

def perform_pool_health_check() -> bool:
    """执行连接池健康检查"""
    try:
        # 尝试获取并测试一个连接
        conn = get_connection()
        if conn:
            health_ok = check_connection_health(conn)
            return_connection(conn)
            if health_ok:
                logger.info("连接池健康检查通过")
                return True
            else:
                logger.warning("连接池健康检查失败：连接不健康")
                return False
        else:
            logger.error("连接池健康检查失败：无法获取连接")
            return False
    except Exception as e:
        logger.error(f"连接池健康检查异常: {e}")
        return False

def close_all_connections():
    """关闭所有数据库连接，通常在应用关闭时调用"""
    global connection_pool
    if connection_pool:
        connection_pool.closeall()
        connection_pool = None
        logger.info("所有数据库连接已关闭")
        print("所有数据库连接已关闭")

# 异步数据库连接池配置
async_connection_pool = None
async_pool_lock = asyncio.Lock()

# 异步数据库连接字符串
ASYNC_DATABASE_URL = f"postgresql://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"

async def check_async_connection_health(conn) -> bool:
    """检查异步数据库连接的健康状态"""
    try:
        await conn.execute("SELECT 1")
        return True
    except Exception as e:
        logger.warning(f"异步连接健康检查失败: {e}")
        return False

async def get_async_connection_pool():
    """获取异步数据库连接池，使用单例模式确保只创建一个连接池（带健康检查）"""
    global async_connection_pool
    if async_connection_pool is None:
        async with async_pool_lock:
            if async_connection_pool is None:
                try:
                    async_connection_pool = await asyncpg.create_pool(
                        ASYNC_DATABASE_URL,
                        min_size=10,  # 最小连接数
                        max_size=50,  # 最大连接数，增加以应对高并发
                        command_timeout=60
                    )
                    logger.info("异步数据库连接池创建成功")
                    print("异步数据库连接池创建成功")
                except Exception as e:
                    logger.error(f"创建异步数据库连接池失败: {e}")
                    print(f"创建异步数据库连接池失败: {e}")
                    raise
    return async_connection_pool

@asynccontextmanager
async def get_async_db_connection():
    """异步上下文管理器，自动管理异步数据库连接的获取和释放（带健康检查）"""
    pool = await get_async_connection_pool()
    conn = None
    max_retries = 3
    retry_delay = 1
    
    for attempt in range(max_retries):
        try:
            conn = await pool.acquire()
            if conn:
                # 检查连接健康状态
                if await check_async_connection_health(conn):
                    break
                else:
                    # 连接不健康，释放并重试
                    logger.warning(f"异步连接不健康，尝试重新获取连接 (尝试 {attempt + 1}/{max_retries})")
                    await pool.release(conn)
                    conn = None
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_delay)
                        continue
        except Exception as e:
            logger.error(f"获取异步数据库连接失败 (尝试 {attempt + 1}/{max_retries}): {e}")
            if conn:
                await pool.release(conn)
                conn = None
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)
                continue
            raise
    
    if not conn:
        raise Exception(f"经过 {max_retries} 次尝试后仍无法获取健康的异步数据库连接")
    
    try:
        yield conn
    except Exception as e:
        # asyncpg 会自动处理事务回滚
        raise e
    finally:
        if conn:
            await pool.release(conn)

async def get_async_pool_status() -> dict:
    """获取异步连接池状态信息"""
    try:
        pool = await get_async_connection_pool()
        status = {
            "pool_created": pool is not None,
            "min_connections": 10,
            "max_connections": 50,
            "timestamp": time.time()
        }
        
        # 获取连接池的详细状态
        if pool:
            status["current_size"] = pool.get_size()
            status["idle_connections"] = pool.get_idle_size()
        
        return status
    except Exception as e:
        logger.error(f"获取异步连接池状态失败: {e}")
        return {"error": str(e), "timestamp": time.time()}

async def perform_async_pool_health_check() -> bool:
    """执行异步连接池健康检查"""
    try:
        # 尝试获取并测试一个连接
        async with get_async_db_connection() as conn:
            health_ok = await check_async_connection_health(conn)
            if health_ok:
                logger.info("异步连接池健康检查通过")
                return True
            else:
                logger.warning("异步连接池健康检查失败：连接不健康")
                return False
    except Exception as e:
        logger.error(f"异步连接池健康检查异常: {e}")
        return False

async def close_async_connections():
    """关闭所有异步数据库连接，通常在应用关闭时调用"""
    global async_connection_pool
    if async_connection_pool:
        await async_connection_pool.close()
        async_connection_pool = None
        logger.info("所有异步数据库连接已关闭")
        print("所有异步数据库连接已关闭")
