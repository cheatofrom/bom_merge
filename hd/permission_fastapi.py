from fastapi import FastAPI, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import logging
from services.auth_service import auth_service
from services.cache_service import cache_service
from auth_fastapi import get_current_user, get_admin_user, PermissionGrant, PermissionRevoke, PermissionCheck
from db import get_db_connection
import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_permission_routes(app: FastAPI):
    """创建权限管理相关的路由"""
    
    def check_permission_internal(user_info: dict, resource_type: str, resource_id: str, required_permission: str = 'view') -> bool:
        """内部权限检查函数（带Redis缓存优化）"""
        try:
            # 管理员拥有所有权限
            if user_info['role'] == 'admin':
                return True
            
            # 构建缓存键
            cache_key = f"permission:{user_info['id']}:{resource_type}:{resource_id}:{required_permission}"
            
            # 尝试从缓存获取权限结果
            cached_result = cache_service.get(cache_key)
            if cached_result is not None:
                logger.debug(f"从缓存获取权限检查结果: {cache_key}")
                return cached_result
            
            # 缓存未命中，查询数据库
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                try:
                    # 只支持分类权限检查
                    if resource_type == 'category':
                        cursor.execute(
                            "SELECT permission_type FROM user_category_permissions WHERE user_id = %s AND category_id = %s",
                            (user_info['id'], resource_id)
                        )
                    else:
                        # 无效的资源类型，缓存结果并返回False
                        cache_service.set(cache_key, False, expire=300)  # 缓存5分钟
                        return False
                    
                    permission = cursor.fetchone()
                    if not permission:
                        # 无权限，缓存结果并返回False
                        cache_service.set(cache_key, False, expire=300)  # 缓存5分钟
                        return False
                    
                    # 权限级别检查
                    permission_levels = {'view': 1, 'edit': 2, 'delete': 3, 'admin': 4}
                    user_level = permission_levels.get(permission['permission_type'], 0)
                    required_level = permission_levels.get(required_permission, 1)
                    
                    result = user_level >= required_level
                    
                    # 缓存权限检查结果（5分钟）
                    cache_service.set(cache_key, result, expire=300)
                    logger.debug(f"缓存权限检查结果: {cache_key} = {result}")
                    
                    return result
                finally:
                    cursor.close()
            
        except psycopg2.Error as e:
            logger.error(f"Permission check error: {e}")
            return False

    
    @app.post("/api/permissions/grant")
    async def grant_permission(permission_data: PermissionGrant, current_user_data = Depends(get_admin_user)):
        """授予用户权限"""
        try:
            user_info, token = current_user_data
            
            # 验证必需字段 - 只支持分类权限
            if not permission_data.category_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="必须指定分类ID"
                )
            
            if permission_data.permission_type not in ['view', 'edit']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="无效的权限类型，只支持view和edit"
                )
            
            with get_db_connection() as conn:
                cursor = conn.cursor()
            
            # 检查用户是否存在
            cursor.execute("SELECT id FROM users WHERE id = %s", (permission_data.user_id,))
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="用户不存在"
                )
            
            # 检查分类是否存在
            cursor.execute("SELECT id FROM categories WHERE id = %s", (permission_data.category_id,))
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="分类不存在"
                )
            
            # 插入或更新分类权限
            cursor.execute(
                "INSERT INTO user_category_permissions (user_id, category_id, permission_type, granted_by) VALUES (%s, %s, %s, %s) ON CONFLICT (user_id, category_id) DO UPDATE SET permission_type = EXCLUDED.permission_type, granted_by = EXCLUDED.granted_by, updated_at = CURRENT_TIMESTAMP",
                (permission_data.user_id, permission_data.category_id, permission_data.permission_type, user_info['id'])
            )
            
            conn.commit()
            
            # 记录操作日志
            auth_service.log_user_activity(
                user_info['id'],
                'grant_permission',
                'permission',
                f"{permission_data.user_id}_{permission_data.category_id}",
                {
                    'target_user_id': permission_data.user_id,
                    'permission_type': permission_data.permission_type,
                    'category_id': permission_data.category_id
                }
            )
            
            return {"message": "权限授予成功"}
            
        except HTTPException:
            raise
        except psycopg2.Error as e:
            logger.error(f"Grant permission error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="权限授予失败"
            )

    
    @app.delete("/api/permissions/revoke")
    async def revoke_permission(permission_data: PermissionRevoke, current_user_data = Depends(get_admin_user)):
        """撤销用户分类权限"""
        try:
            user_info, token = current_user_data
            
            if not permission_data.category_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="必须指定分类ID"
                )
            
            with get_db_connection() as conn:
                cursor = conn.cursor()
            
            # 删除分类权限
            cursor.execute(
                "DELETE FROM user_category_permissions WHERE user_id = %s AND category_id = %s",
                (permission_data.user_id, permission_data.category_id)
            )
            
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="权限不存在"
                )
            
            conn.commit()
            
            # 记录操作日志
            auth_service.log_user_activity(
                user_info['id'],
                'revoke_permission',
                'permission',
                f"{permission_data.user_id}_{permission_data.category_id}",
                {
                    'target_user_id': permission_data.user_id,
                    'category_id': permission_data.category_id
                }
            )
            
            return {"message": "权限撤销成功"}
            
        except HTTPException:
            raise
        except psycopg2.Error as e:
            logger.error(f"Revoke permission error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="权限撤销失败"
            )

    
    @app.get("/api/permissions/user/{user_id}")
    async def get_user_permissions(user_id: int, current_user_data = Depends(get_admin_user)):
        """获取用户的所有权限（带连接管理优化）"""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                try:
                    # 获取用户分类权限
                    cursor.execute(
                            """SELECT 
                            ucp.id,
                            ucp.category_id,
                            ucp.permission_type,
                            ucp.created_at,
                            ucp.updated_at,
                            u.username as granted_by_username,
                            'category' as resource_type,
                            c.name as resource_name
                        FROM user_category_permissions ucp
                        LEFT JOIN users u ON ucp.granted_by = u.id
                        LEFT JOIN categories c ON ucp.category_id = c.id
                        WHERE ucp.user_id = %s
                        ORDER BY ucp.created_at DESC""",
                            (user_id,)
                        )
                    permissions = cursor.fetchall()
                    
                    # 格式化日期
                    for permission in permissions:
                        if permission['created_at']:
                            permission['created_at'] = permission['created_at'].isoformat()
                    
                    return {"permissions": permissions}
                finally:
                    cursor.close()
            
        except psycopg2.Error as e:
            logger.error(f"Get user permissions error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="获取用户权限失败"
            )

    
    @app.get("/api/permissions/my-resources")
    async def get_my_resources(current_user_data = Depends(get_current_user)):
        """获取当前用户有权限访问的资源（带连接管理优化）"""
        try:
            user_info, token = current_user_data
            
            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                try:
                    # 管理员可以访问所有资源
                    if user_info['role'] == 'admin':
                        # 获取所有文件
                        cursor.execute(
                            "SELECT file_unique_id as file_id, original_filename as filename, project_name, upload_time as created_at FROM uploaded_files ORDER BY upload_time DESC"
                        )
                        files = cursor.fetchall()
                        
                        # 获取所有合并项目
                        cursor.execute(
                            "SELECT id, merged_project_name as project_name, created_at FROM merged_projects ORDER BY created_at DESC"
                        )
                        merged_projects = cursor.fetchall()
                        
                        # 获取所有分类
                        cursor.execute(
                            "SELECT id, name, created_at FROM categories ORDER BY created_at DESC"
                        )
                        categories = cursor.fetchall()
                        
                        resources = {
                            'files': files,
                            'merged_projects': merged_projects,
                            'categories': categories
                        }
                    else:
                        # 普通用户只能访问有权限的分类资源
                        cursor.execute(
                            """SELECT 
                                ucp.category_id,
                                ucp.permission_type,
                                c.name as category_name,
                                c.created_at as category_created_at
                            FROM user_category_permissions ucp
                            LEFT JOIN categories c ON ucp.category_id = c.id
                            WHERE ucp.user_id = %s
                            ORDER BY ucp.created_at DESC""",
                            (user_info['id'],)
                        )
                        permissions = cursor.fetchall()
                        
                        files = []
                        merged_projects = []
                        categories = []
                        
                        # 收集用户有权限的分类ID
                        category_ids = []
                        
                        for perm in permissions:
                            categories.append({
                                'id': perm['category_id'],
                                'name': perm['category_name'],
                                'created_at': perm['category_created_at'],
                                'permission': perm['permission_type']
                            })
                            category_ids.append(perm['category_id'])
                        
                        # 获取分类权限对应的文件
                        if category_ids:
                            cursor.execute(
                                """SELECT DISTINCT 
                                    uf.file_unique_id as file_id,
                                    uf.original_filename as filename,
                                    uf.project_name,
                                    uf.upload_time as created_at
                                FROM uploaded_files uf
                                WHERE uf.category_id = ANY(%s)
                                ORDER BY uf.upload_time DESC""",
                                (category_ids,)
                            )
                            category_files = cursor.fetchall()
                            
                            # 添加分类下的文件到文件列表（避免重复）
                            existing_file_ids = {f['file_id'] for f in files}
                            for cf in category_files:
                                if cf['file_id'] not in existing_file_ids:
                                    files.append({
                                        'file_id': cf['file_id'],
                                        'filename': cf['filename'],
                                        'created_at': cf['created_at'],
                                        'permission': 'view'  # 通过分类权限获得的默认权限
                                    })
                        
                        resources = {
                            'files': files,
                            'merged_projects': merged_projects,
                            'categories': categories
                        }
                    
                    # 格式化日期
                    for resource_type in resources:
                        for resource in resources[resource_type]:
                            if resource.get('created_at'):
                                resource['created_at'] = resource['created_at'].isoformat()
                    
                    return resources
                finally:
                    cursor.close()
            
        except psycopg2.Error as e:
            logger.error(f"Get my resources error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="获取资源列表失败"
            )

    
    @app.post("/api/permissions/check")
    async def check_resource_permission(permission_data: PermissionCheck, current_user_data = Depends(get_current_user)):
        """检查用户对特定资源的权限"""
        try:
            user_info, token = current_user_data
            
            has_permission = check_permission_internal(
                user_info, 
                permission_data.resource_type, 
                permission_data.resource_id, 
                permission_data.permission
            )
            
            return {
                'has_permission': has_permission,
                'resource_type': permission_data.resource_type,
                'resource_id': permission_data.resource_id,
                'permission': permission_data.permission
            }
            
        except Exception as e:
            logger.error(f"Check permission error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="权限检查失败"
            )
    
    # 返回权限检查函数供其他模块使用
    return check_permission_internal