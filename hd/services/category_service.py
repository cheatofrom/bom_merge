import psycopg2
import asyncpg
from typing import List, Dict, Optional
import logging
from db import get_connection, get_db_connection, get_async_db_connection

logger = logging.getLogger(__name__)

# 同步版本的分类服务函数

def get_all_categories() -> List[Dict]:
    """
    获取所有分类
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        query = """
        SELECT id, name, description, color, created_at, updated_at
        FROM categories
        ORDER BY created_at ASC
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        categories = []
        for row in rows:
            categories.append({
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'color': row[3],
                'created_at': row[4].isoformat() if row[4] else None,
                'updated_at': row[5].isoformat() if row[5] else None
            })
        
        cursor.close()
        conn.close()
        
        return categories
        
    except Exception as e:
        logger.error(f"获取分类列表失败: {str(e)}")
        raise e

def get_category_by_id(category_id: int) -> Optional[Dict]:
    """
    根据ID获取分类
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        query = """
        SELECT id, name, description, color, created_at, updated_at
        FROM categories
        WHERE id = %s
        """
        
        cursor.execute(query, (category_id,))
        row = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        if row:
            return {
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'color': row[3],
                'created_at': row[4].isoformat() if row[4] else None,
                'updated_at': row[5].isoformat() if row[5] else None
            }
        
        return None
        
    except Exception as e:
        logger.error(f"获取分类失败: {str(e)}")
        raise e

def create_category(name: str, description: str = None, color: str = '#3B82F6') -> Dict:
    """
    创建新分类
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        query = """
        INSERT INTO categories (name, description, color)
        VALUES (%s, %s, %s)
        RETURNING id, name, description, color, created_at, updated_at
        """
        
        cursor.execute(query, (name, description, color))
        row = cursor.fetchone()
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'color': row[3],
            'created_at': row[4].isoformat() if row[4] else None,
            'updated_at': row[5].isoformat() if row[5] else None
        }
        
    except psycopg2.IntegrityError as e:
        logger.error(f"分类名称已存在: {str(e)}")
        raise ValueError(f"分类名称 '{name}' 已存在")
    except Exception as e:
        logger.error(f"创建分类失败: {str(e)}")
        raise e

def update_category(category_id: int, name: str = None, description: str = None, color: str = None) -> Optional[Dict]:
    """
    更新分类
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # 构建动态更新查询
        update_fields = []
        params = []
        
        if name is not None:
            update_fields.append("name = %s")
            params.append(name)
        
        if description is not None:
            update_fields.append("description = %s")
            params.append(description)
        
        if color is not None:
            update_fields.append("color = %s")
            params.append(color)
        
        if not update_fields:
            return get_category_by_id(category_id)
        
        params.append(category_id)
        
        query = f"""
        UPDATE categories 
        SET {', '.join(update_fields)}
        WHERE id = %s
        RETURNING id, name, description, color, created_at, updated_at
        """
        
        cursor.execute(query, params)
        row = cursor.fetchone()
        
        conn.commit()
        cursor.close()
        conn.close()
        
        if row:
            return {
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'color': row[3],
                'created_at': row[4].isoformat() if row[4] else None,
                'updated_at': row[5].isoformat() if row[5] else None
            }
        
        return None
        
    except psycopg2.IntegrityError as e:
        logger.error(f"分类名称已存在: {str(e)}")
        raise ValueError(f"分类名称已存在")
    except Exception as e:
        logger.error(f"更新分类失败: {str(e)}")
        raise e

def delete_category(category_id: int) -> bool:
    """
    删除分类
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # 检查是否有项目使用此分类
        check_query = "SELECT COUNT(*) FROM project_categories WHERE category_id = %s"
        cursor.execute(check_query, (category_id,))
        count = cursor.fetchone()[0]
        
        if count > 0:
            cursor.close()
            conn.close()
            raise ValueError(f"无法删除分类，还有 {count} 个项目正在使用此分类")
        
        # 删除分类
        delete_query = "DELETE FROM categories WHERE id = %s"
        cursor.execute(delete_query, (category_id,))
        
        deleted_count = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        
        return deleted_count > 0
        
    except Exception as e:
        logger.error(f"删除分类失败: {str(e)}")
        raise e

# 异步版本的分类服务函数

async def get_all_categories_async() -> List[Dict]:
    """
    异步获取所有分类
    """
    try:
        async with get_async_db_connection() as conn:
            query = """
            SELECT id, name, description, color, created_at, updated_at
            FROM categories
            ORDER BY created_at ASC
            """
            
            rows = await conn.fetch(query)
            
            categories = []
            for row in rows:
                categories.append({
                    'id': row['id'],
                    'name': row['name'],
                    'description': row['description'],
                    'color': row['color'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                    'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
                })
            
            return categories
        
    except Exception as e:
        logger.error(f"异步获取分类列表失败: {str(e)}")
        raise e

async def get_category_by_id_async(category_id: int) -> Optional[Dict]:
    """
    异步根据ID获取分类
    """
    try:
        async with get_async_db_connection() as conn:
            query = """
            SELECT id, name, description, color, created_at, updated_at
            FROM categories
            WHERE id = $1
            """
            
            row = await conn.fetchrow(query, category_id)
            
            if row:
                return {
                    'id': row['id'],
                    'name': row['name'],
                    'description': row['description'],
                    'color': row['color'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                    'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
                }
            
            return None
        
    except Exception as e:
        logger.error(f"异步获取分类失败: {str(e)}")
        raise e

async def create_category_async(name: str, description: str = None, color: str = '#3B82F6') -> Dict:
    """
    异步创建新分类
    """
    try:
        async with get_async_db_connection() as conn:
            query = """
            INSERT INTO categories (name, description, color)
            VALUES ($1, $2, $3)
            RETURNING id, name, description, color, created_at, updated_at
            """
            
            row = await conn.fetchrow(query, name, description, color)
            
            return {
                'id': row['id'],
                'name': row['name'],
                'description': row['description'],
                'color': row['color'],
                'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
            }
        
    except asyncpg.UniqueViolationError as e:
        logger.error(f"分类名称已存在: {str(e)}")
        raise ValueError(f"分类名称 '{name}' 已存在")
    except Exception as e:
        logger.error(f"异步创建分类失败: {str(e)}")
        raise e

async def update_category_async(category_id: int, name: str = None, description: str = None, color: str = None) -> Optional[Dict]:
    """
    异步更新分类
    """
    try:
        # 构建动态更新查询
        update_fields = []
        params = [category_id]
        param_index = 2
        
        if name is not None:
            update_fields.append(f"name = ${param_index}")
            params.append(name)
            param_index += 1
        
        if description is not None:
            update_fields.append(f"description = ${param_index}")
            params.append(description)
            param_index += 1
        
        if color is not None:
            update_fields.append(f"color = ${param_index}")
            params.append(color)
            param_index += 1
        
        if not update_fields:
            return await get_category_by_id_async(category_id)
        
        async with get_async_db_connection() as conn:
            query = f"""
            UPDATE categories 
            SET {', '.join(update_fields)}
            WHERE id = $1
            RETURNING id, name, description, color, created_at, updated_at
            """
            
            row = await conn.fetchrow(query, *params)
            
            if row:
                return {
                    'id': row['id'],
                    'name': row['name'],
                    'description': row['description'],
                    'color': row['color'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                    'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
                }
            
            return None
        
    except asyncpg.UniqueViolationError as e:
        logger.error(f"分类名称已存在: {str(e)}")
        raise ValueError(f"分类名称已存在")
    except Exception as e:
        logger.error(f"异步更新分类失败: {str(e)}")
        raise e

async def delete_category_async(category_id: int) -> bool:
    """
    异步删除分类
    """
    try:
        async with get_async_db_connection() as conn:
            # 检查是否有项目使用此分类
            check_query = "SELECT COUNT(*) FROM project_categories WHERE category_id = $1"
            count = await conn.fetchval(check_query, category_id)
            
            if count > 0:
                raise ValueError(f"无法删除分类，还有 {count} 个项目正在使用此分类")
            
            # 删除分类
            delete_query = "DELETE FROM categories WHERE id = $1"
            result = await conn.execute(delete_query, category_id)
            
            # 检查删除结果
            return result == "DELETE 1"
        
    except Exception as e:
        logger.error(f"异步删除分类失败: {str(e)}")
        raise e

# 项目分类关联服务函数

async def assign_project_to_category_async(project_name: str, file_unique_id: str, category_id: int) -> Dict:
    """
    异步将项目分配到分类
    """
    try:
        async with get_async_db_connection() as conn:
            # 先删除现有关联（如果存在）
            delete_query = "DELETE FROM project_categories WHERE project_name = $1 AND file_unique_id = $2"
            await conn.execute(delete_query, project_name, file_unique_id)
            
            # 创建新关联
            insert_query = """
            INSERT INTO project_categories (project_name, file_unique_id, category_id)
            VALUES ($1, $2, $3)
            RETURNING id, project_name, file_unique_id, category_id, created_at
            """
            
            row = await conn.fetchrow(insert_query, project_name, file_unique_id, category_id)
            
            return {
                'id': row['id'],
                'project_name': row['project_name'],
                'file_unique_id': row['file_unique_id'],
                'category_id': row['category_id'],
                'created_at': row['created_at'].isoformat() if row['created_at'] else None
            }
        
    except Exception as e:
        logger.error(f"异步分配项目到分类失败: {str(e)}")
        raise e

async def get_projects_by_category_async(category_id: int) -> List[Dict]:
    """
    异步获取指定分类下的所有项目
    """
    try:
        async with get_async_db_connection() as conn:
            query = """
            SELECT pc.id, pc.project_name, pc.file_unique_id, pc.category_id, pc.created_at,
                   c.name as category_name, c.color as category_color
            FROM project_categories pc
            JOIN categories c ON pc.category_id = c.id
            WHERE pc.category_id = $1
            ORDER BY pc.created_at DESC
            """
            
            rows = await conn.fetch(query, category_id)
            
            projects = []
            for row in rows:
                projects.append({
                    'id': row['id'],
                    'project_name': row['project_name'],
                    'file_unique_id': row['file_unique_id'],
                    'category_id': row['category_id'],
                    'category_name': row['category_name'],
                    'category_color': row['category_color'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None
                })
            
            return projects
        
    except Exception as e:
        logger.error(f"异步获取分类项目失败: {str(e)}")
        raise e