from db import get_async_db_connection
import json
from datetime import datetime


async def create_file_mapping_async(file_unique_id, entity_type, entity_id, mapping_type, mapping_data=None):
    """
    异步创建文件与实体的映射关系
    
    Args:
        file_unique_id (str): 文件唯一ID
        entity_type (str): 实体类型，如'project'、'part'等
        entity_id (str): 实体ID
        mapping_type (str): 映射类型
        mapping_data (dict, optional): 映射数据
    
    Returns:
        int: 新插入记录的ID
    """
    try:
        async with get_async_db_connection() as conn:
            # 插入映射信息
            result = await conn.fetchrow("""
                INSERT INTO file_mappings (
                    file_unique_id, entity_type, entity_id, mapping_type, mapping_data
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            """, 
                file_unique_id, entity_type, entity_id, mapping_type, 
                json.dumps(mapping_data) if mapping_data else None
            )
            
            return result['id']
    except Exception as e:
        raise e


async def get_file_mappings_async(file_unique_id=None, entity_type=None, entity_id=None):
    """
    异步获取文件映射列表
    
    Args:
        file_unique_id (str, optional): 文件唯一ID过滤. 默认为 None.
        entity_type (str, optional): 实体类型过滤. 默认为 None.
        entity_id (str, optional): 实体ID过滤. 默认为 None.
    
    Returns:
        list: 映射信息列表
    """
    try:
        async with get_async_db_connection() as conn:
            query = """
                SELECT id, file_unique_id, entity_type, entity_id, mapping_type, mapping_data,
                       created_at, updated_at
                FROM file_mappings
                WHERE 1=1
            """
            params = []
            
            if file_unique_id:
                query += " AND file_unique_id = $" + str(len(params) + 1)
                params.append(file_unique_id)
            
            if entity_type:
                query += " AND entity_type = $" + str(len(params) + 1)
                params.append(entity_type)
            
            if entity_id:
                query += " AND entity_id = $" + str(len(params) + 1)
                params.append(entity_id)
            
            query += " ORDER BY created_at DESC"
            
            rows = await conn.fetch(query, *params)
            
            result = []
            for row in rows:
                result.append({
                    "id": row['id'],
                    "file_unique_id": row['file_unique_id'],
                    "entity_type": row['entity_type'],
                    "entity_id": row['entity_id'],
                    "mapping_type": row['mapping_type'],
                    "mapping_data": row['mapping_data'],
                    "created_at": row['created_at'].isoformat() if row['created_at'] else "",
                    "updated_at": row['updated_at'].isoformat() if row['updated_at'] else ""
                })
        
        return result
    except Exception as e:
        raise e


async def update_file_mapping_async(mapping_id, mapping_data):
    """
    异步更新文件映射数据
    
    Args:
        mapping_id (int): 映射记录ID
        mapping_data (dict): 新的映射数据
    
    Returns:
        bool: 更新是否成功
    """
    try:
        async with get_async_db_connection() as conn:
            result = await conn.execute("""
                UPDATE file_mappings
                SET mapping_data = $1, updated_at = $2
                WHERE id = $3
            """, 
                json.dumps(mapping_data) if mapping_data else None,
                datetime.now(),
                mapping_id
            )
            
            return result == 'UPDATE 1'
    except Exception as e:
        raise e

async def delete_file_mapping_async(mapping_id):
    """
    异步删除文件映射
    
    Args:
        mapping_id (int): 映射记录ID
    
    Returns:
        bool: 删除是否成功
    """
    try:
        async with get_async_db_connection() as conn:
            result = await conn.execute("""
                DELETE FROM file_mappings
                WHERE id = $1
            """, mapping_id)
            
            return result == 'DELETE 1'
    except Exception as e:
        raise e