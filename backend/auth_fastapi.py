from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging
from services.auth_service import auth_service
from datetime import datetime
from psycopg2.extras import RealDictCursor
from psycopg2 import Error

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 安全方案
security = HTTPBearer()

# Pydantic模型
class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class PermissionGrant(BaseModel):
    user_id: int
    category_id: int
    permission_type: str = 'view'

class PermissionRevoke(BaseModel):
    user_id: int
    category_id: int

class PermissionCheck(BaseModel):
    resource_type: str
    resource_id: str
    permission: str = 'view'

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# 依赖函数
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """获取当前用户信息"""
    token = credentials.credentials
    is_valid, user_info = auth_service.validate_session(token)
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或过期的令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user_info, token

async def get_admin_user(current_user_data = Depends(get_current_user)):
    """获取管理员用户"""
    user_info, token = current_user_data
    
    if user_info['role'] != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    
    return user_info, token

def check_resource_permission(resource_type: str, resource_id: str, required_permission: str = 'view'):
    """检查用户是否有特定资源的权限（带连接管理优化）"""
    async def permission_checker(current_user_data = Depends(get_current_user)):
        user_info, token = current_user_data
        
        # 管理员拥有所有权限
        if user_info['role'] == 'admin':
            return True
        
        try:
            from db import get_db_connection
            
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                try:
                    # 根据资源类型查询权限
                    if resource_type == 'file':
                        # 通过文件所属分类检查权限
                        cursor.execute(
                            """SELECT ucp.permission_type 
                               FROM user_category_permissions ucp
                               JOIN uploaded_files uf ON ucp.category_id = uf.category_id
                               WHERE ucp.user_id = %s AND uf.file_unique_id = %s""",
                            (user_info['id'], resource_id)
                        )
                    elif resource_type == 'merged_project':
                        # 通过合并项目所属分类检查权限
                        cursor.execute(
                            """SELECT ucp.permission_type 
                               FROM user_category_permissions ucp
                               JOIN merged_projects mp ON ucp.category_id = mp.category_id
                               WHERE ucp.user_id = %s AND mp.id = %s""",
                            (user_info['id'], resource_id)
                        )
                    elif resource_type == 'category':
                        cursor.execute(
                            "SELECT permission_type FROM user_category_permissions WHERE user_id = %s AND category_id = %s",
                            (user_info['id'], resource_id)
                        )
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="无效的资源类型"
                        )
                    
                    permission = cursor.fetchone()
                    if not permission:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="没有访问权限"
                        )
                    
                    # 权限级别检查
                    permission_levels = {'view': 1, 'edit': 2, 'delete': 3, 'admin': 4}
                    user_level = permission_levels.get(permission['permission_type'], 0)
                    required_level = permission_levels.get(required_permission, 1)
                    
                    if user_level < required_level:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="权限不足"
                        )
                    
                    return True
                finally:
                    cursor.close()
            
        except Exception as e:
            logger.error(f"Permission check error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="权限检查失败"
            )
    
    return permission_checker

def create_auth_routes(app: FastAPI):
    """创建认证相关的路由"""
    
    @app.post("/api/auth/register")
    async def register(user_data: UserRegister, request: Request):
        """用户注册"""
        try:
            # 基本验证
            if len(user_data.username) < 3:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="用户名至少需要3个字符"
                )
            
            if len(user_data.password) < 6:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="密码至少需要6个字符"
                )
            
            if '@' not in user_data.email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="请输入有效的邮箱地址"
                )
            
            # 注册用户
            success, message, user_id = auth_service.register_user(
                user_data.username, 
                user_data.email, 
                user_data.password, 
                user_data.full_name
            )
            
            if success:
                return {
                    "message": message,
                    "user_id": user_id
                }
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=message
                )
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Registration error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="注册失败，请稍后重试"
            )
    
    @app.post("/api/auth/login")
    async def login(user_data: UserLogin, request: Request):
        """用户登录"""
        try:
            if not user_data.username or not user_data.password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="用户名和密码不能为空"
                )
            
            # 获取客户端信息
            ip_address = request.client.host
            user_agent = request.headers.get('User-Agent')
            
            # 登录验证
            success, message, user_info = auth_service.login_user(user_data.username, user_data.password)
            
            if success:
                # 记录登录日志
                auth_service.log_user_activity(
                    user_info['id'], 
                    'login', 
                    'user', 
                    str(user_info['id']),
                    {'ip_address': ip_address},
                    ip_address,
                    user_agent
                )
                
                return {
                    "message": message,
                    "user": {
                        "id": user_info['id'],
                        "username": user_info['username'],
                        "email": user_info['email'],
                        "full_name": user_info['full_name'],
                        "role": user_info['role']
                    },
                    "access_token": user_info['token'],
                    "refresh_token": user_info['token'],
                    "token_type": "Bearer"
                }
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=message
                )
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Login error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="登录失败，请稍后重试"
            )
    
    @app.post("/api/auth/logout")
    async def logout(current_user_data = Depends(get_current_user)):
        """用户登出"""
        try:
            user_info, token = current_user_data
            success, message = auth_service.logout_user(token)
            
            if success:
                return {"message": message}
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=message
                )
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Logout error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="登出失败，请稍后重试"
            )
    
    @app.get("/api/auth/me")
    async def get_current_user_info(current_user_data = Depends(get_current_user)):
        """获取当前用户信息"""
        try:
            user_info, token = current_user_data
            return {
                "user": {
                    "id": user_info['id'],
                    "username": user_info['username'],
                    "email": user_info['email'],
                    "full_name": user_info['full_name'],
                    "role": user_info['role']
                }
            }
            
        except Exception as e:
            logger.error(f"Get current user error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="获取用户信息失败"
            )
    
    @app.get("/api/auth/users")
    async def get_users(page: int = 1, per_page: int = 10, current_user_data = Depends(get_admin_user)):
        """获取用户列表（管理员）"""
        try:
            from db import get_db_connection
            
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            offset = (page - 1) * per_page
            
            # 获取用户列表
            cursor.execute(
                "SELECT id, username, email, full_name, role, is_active, created_at, last_login FROM users ORDER BY created_at DESC LIMIT %s OFFSET %s",
                (per_page, offset)
            )
            users = cursor.fetchall()
            
            # 获取总数
            cursor.execute("SELECT COUNT(*) as total FROM users")
            total = cursor.fetchone()['total']
            
            # 格式化日期
            for user in users:
                if user['created_at']:
                    user['created_at'] = user['created_at'].isoformat()
                if user['last_login']:
                    user['last_login'] = user['last_login'].isoformat()
            
            return {
                "users": users,
                "pagination": {
                    "page": page,
                    "per_page": per_page,
                    "total": total,
                    "pages": (total + per_page - 1) // per_page
                }
            }
            
        except Exception as e:
            logger.error(f"Get users error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="获取用户列表失败"
            )

    
    @app.put("/api/auth/users/{user_id}/toggle-status")
    async def toggle_user_status(user_id: int, current_user_data = Depends(get_admin_user)):
        """切换用户状态（启用/禁用）"""
        try:
            from db import get_db_connection
            
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # 获取当前用户状态
            cursor.execute("SELECT is_active FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="用户不存在"
                )
            
            # 切换状态
            new_status = not user['is_active']
            cursor.execute(
                "UPDATE users SET is_active = %s WHERE id = %s",
                (new_status, user_id)
            )
            conn.commit()
            
            # 记录操作日志
            user_info, token = current_user_data
            auth_service.log_user_activity(
                user_info['id'],
                'toggle_user_status',
                'user',
                str(user_id),
                {'new_status': new_status}
            )
            
            status_text = '启用' if new_status else '禁用'
            return {"message": f"用户已{status_text}"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Toggle user status error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="操作失败"
            )
    
    @app.delete("/api/auth/users/{user_id}")
    async def delete_user(user_id: int, current_user_data = Depends(get_admin_user)):
        """删除用户（管理员）"""
        try:
            from db import get_db_connection
            
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # 检查要删除的用户是否存在
            cursor.execute("SELECT id, username, role FROM users WHERE id = %s", (user_id,))
            target_user = cursor.fetchone()
            
            if not target_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="用户不存在"
                )
            
            # 防止删除管理员账户
            if target_user['role'] == 'admin':
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="不能删除管理员账户"
                )
            
            # 删除用户相关的权限记录
            cursor.execute("DELETE FROM user_category_permissions WHERE user_id = %s", (user_id,))

            # 清理用户的Redis会话
            cache_pattern = f"bom:session:{user_id}:*"
            from services.cache_service import cache_service
            cache_service.clear_pattern(cache_pattern)

            # 删除用户活动日志
            cursor.execute("DELETE FROM user_activity_logs WHERE user_id = %s", (user_id,))

            # 删除用户
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            
            conn.commit()
            
            # 记录操作日志
            user_info, token = current_user_data
            auth_service.log_user_activity(
                user_info['id'],
                'delete_user',
                'user',
                str(user_id),
                {'deleted_username': target_user['username']}
            )
            
            return {"message": f"用户 {target_user['username']} 已删除"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Delete user error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="删除用户失败"
            )
    
    @app.post("/api/auth/refresh")
    async def refresh_token(refresh_data: RefreshTokenRequest):
        """刷新令牌"""
        try:
            # 验证刷新令牌
            is_valid, user_info = auth_service.validate_session(refresh_data.refresh_token)
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="无效或过期的刷新令牌"
                )
            
            # 生成新的访问令牌
            new_access_token = auth_service.generate_jwt_token(
                user_info['id'],
                user_info['username'],
                user_info['role']
            )
            
            return {
                "access_token": new_access_token
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="令牌刷新失败"
            )