import hashlib
import jwt
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import Error
import bcrypt
import logging
from db import get_db_connection
from services.cache_service import cache_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AuthService:
    def __init__(self):
        # JWT配置 - 在生产环境中应该使用环境变量
        self.jwt_secret = "your-secret-key-change-in-production"
        self.jwt_algorithm = "HS256"
        self.token_expire_hours = 24
    
    def hash_password(self, password: str) -> str:
        """对密码进行哈希处理"""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def verify_password(self, password: str, hashed: str) -> bool:
        """验证密码"""
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    
    def generate_jwt_token(self, user_id: int, username: str, role: str) -> str:
        """生成JWT令牌"""
        payload = {
            'user_id': user_id,
            'username': username,
            'role': role,
            'exp': datetime.utcnow() + timedelta(hours=self.token_expire_hours),
            'iat': datetime.utcnow()
        }
        return jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)
    
    def verify_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """验证JWT令牌"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.jwt_algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token has expired")
            return None
        except jwt.InvalidTokenError:
            logger.warning("Invalid JWT token")
            return None
    
    def register_user(self, username: str, email: str, password: str, full_name: str = None) -> Tuple[bool, str, Optional[int]]:
        """用户注册"""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
            
            # 检查用户名和邮箱是否已存在
            cursor.execute("SELECT id FROM users WHERE username = %s OR email = %s", (username, email))
            if cursor.fetchone():
                return False, "用户名或邮箱已存在", None
            
            # 创建新用户
            password_hash = self.hash_password(password)
            cursor.execute(
                "INSERT INTO users (username, email, password_hash, full_name) VALUES (%s, %s, %s, %s) RETURNING id",
                (username, email, password_hash, full_name)
            )
            user_id = cursor.fetchone()[0]
            conn.commit()
            
            logger.info(f"User registered successfully: {username}")
            return True, "注册成功", user_id
            
        except psycopg2.Error as e:
            logger.error(f"Database error during registration: {e}")
            return False, "注册失败，请稍后重试", None

    
    def login_user(self, username: str, password: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """用户登录（带连接管理优化）"""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                try:
                    # 查找用户
                    cursor.execute(
                        "SELECT id, username, email, password_hash, full_name, role, is_active FROM users WHERE username = %s OR email = %s",
                        (username, username)
                    )
                    user = cursor.fetchone()
                    
                    if not user:
                        return False, "用户不存在", None
                    
                    if not user['is_active']:
                        return False, "账户已被禁用", None
                    
                    # 验证密码
                    if not self.verify_password(password, user['password_hash']):
                        return False, "密码错误", None
                    
                    # 生成JWT令牌
                    token = self.generate_jwt_token(user['id'], user['username'], user['role'])
                    
                    # 保存会话信息
                    token_hash = hashlib.sha256(token.encode()).hexdigest()
                    expires_at = datetime.utcnow() + timedelta(hours=self.token_expire_hours)
                    
                    cursor.execute(
                        "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (%s, %s, %s)",
                        (user['id'], token_hash, expires_at)
                    )
                    
                    # 更新最后登录时间
                    cursor.execute(
                        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = %s",
                        (user['id'],)
                    )
                    
                    conn.commit()
                    
                    # 记录登录日志
                    self.log_user_activity(user['id'], 'login', 'user', str(user['id']))
                    
                    user_info = {
                        'id': user['id'],
                        'username': user['username'],
                        'email': user['email'],
                        'full_name': user['full_name'],
                        'role': user['role'],
                        'token': token
                    }
                    
                    logger.info(f"User logged in successfully: {username}")
                    return True, "登录成功", user_info
                finally:
                    cursor.close()
            
        except psycopg2.Error as e:
            logger.error(f"Database error during login: {e}")
            return False, "登录失败，请稍后重试", None
    
    def logout_user(self, token: str) -> Tuple[bool, str]:
        """用户登出（带缓存清理）"""
        try:
            # 验证令牌
            payload = self.verify_jwt_token(token)
            if not payload:
                return False, "无效的令牌"
            
            user_id = payload['user_id']
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            with get_db_connection() as conn:
                cursor = conn.cursor()
                try:
                    # 撤销会话
                    cursor.execute(
                        "UPDATE user_sessions SET is_revoked = TRUE WHERE token_hash = %s",
                        (token_hash,)
                    )
                    conn.commit()
                finally:
                    cursor.close()
            
            # 清理相关缓存
            cache_pattern = f"user_session:{user_id}:*"
            cache_service.clear_pattern(cache_pattern)
            logger.debug(f"清理用户缓存: {user_id}")
            
            # 记录登出日志
            self.log_user_activity(user_id, 'logout', 'user', str(user_id))
            
            logger.info(f"User logged out successfully: {payload['username']}")
            return True, "登出成功"
            
        except Error as e:
            logger.error(f"Database error during logout: {e}")
            return False, "登出失败"

    
    def validate_session(self, token: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """验证用户会话（带缓存优化）"""
        try:
            # 验证JWT令牌
            payload = self.verify_jwt_token(token)
            if not payload:
                return False, None
            
            user_id = payload['user_id']
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            # 尝试从缓存获取用户信息
            cache_key = f"user_session:{user_id}:{token_hash[:16]}"
            cached_user = cache_service.get(cache_key)
            
            if cached_user:
                logger.debug(f"从缓存获取用户会话: {user_id}")
                return True, cached_user
            
            # 缓存未命中，查询数据库
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                try:
                    # 检查会话是否有效
                    cursor.execute(
                        "SELECT id FROM user_sessions WHERE token_hash = %s AND expires_at > NOW() AND is_revoked = FALSE",
                        (token_hash,)
                    )
                    
                    if not cursor.fetchone():
                        return False, None
                    
                    # 获取最新用户信息
                    cursor.execute(
                        "SELECT id, username, email, full_name, role, is_active FROM users WHERE id = %s",
                        (user_id,)
                    )
                    user = cursor.fetchone()
                    
                    if not user or not user['is_active']:
                        return False, None
                    
                    # 将用户信息缓存5分钟
                    user_dict = dict(user)
                    cache_service.set(cache_key, user_dict, expire=300)
                    logger.debug(f"缓存用户会话: {user_id}")
                    
                    return True, user_dict
                finally:
                    cursor.close()
            
        except Error as e:
            logger.error(f"Database error during session validation: {e}")
            return False, None

    
    def log_user_activity(self, user_id: int, action: str, resource_type: str = None, resource_id: str = None, details: Dict = None, ip_address: str = None, user_agent: str = None):
        """记录用户活动日志"""
        try:
            import json
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                # 将字典转换为JSON字符串
                details_json = json.dumps(details) if details else None
                
                cursor.execute(
                    "INSERT INTO user_activity_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (user_id, action, resource_type, resource_id, details_json, ip_address, user_agent)
                )
                conn.commit()
            
        except Error as e:
            logger.error(f"Error logging user activity: {e}")

    
    def cleanup_expired_sessions(self):
        """清理过期的会话（带连接管理优化）"""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                try:
                    cursor.execute("DELETE FROM user_sessions WHERE expires_at < NOW()")
                    deleted_count = cursor.rowcount
                    conn.commit()
                    
                    logger.info(f"Cleaned up {deleted_count} expired sessions")
                finally:
                    cursor.close()
            
        except Error as e:
            logger.error(f"Error cleaning up expired sessions: {e}")


# 创建全局认证服务实例
auth_service = AuthService()