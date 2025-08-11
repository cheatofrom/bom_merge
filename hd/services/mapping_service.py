from db import get_connection
import json
from datetime import datetime

def create_file_mapping(file_unique_id, entity_type, entity_id, mapping_type, mapping_data=None):
    """
    创建文件与实体的映射关系
    
    Args:
        file_unique_id (str): 文件唯一ID
        entity_type (str): 实体类型，如'project'、'part'等
        entity_id (str): 实体ID
        mapping_type (str): 映射类型
        mapping_data (dict, optional): 映射数据
    
    Returns:
        int: 新插入记录的ID
    """
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        # 插入映射信息
        cur.execute("""
            INSERT INTO file_mappings (
                file_unique_id, entity_type, entity_id, mapping_type, mapping_data
            ) VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (
            file_unique_id, entity_type, entity_id, mapping_type, 
            json.dumps(mapping_data) if mapping_data else None
        ))
        
        mapping_id = cur.fetchone()[0]
        conn.commit()
        return mapping_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()

def get_file_mappings(file_unique_id=None, entity_type=None, entity_id=None):
    """
    获取文件映射列表
    
    Args:
        file_unique_id (str, optional): 文件唯一ID过滤. 默认为 None.
        entity_type (str, optional): 实体类型过滤. 默认为 None.
        entity_id (str, optional): 实体ID过滤. 默认为 None.
    
    Returns:
        list: 映射信息列表
    """
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        query = """
            SELECT id, file_unique_id, entity_type, entity_id, mapping_type, mapping_data,
                   created_at, updated_at
            FROM file_mappings
            WHERE 1=1
        """
        params = []
        
        if file_unique_id:
            query += " AND file_unique_id = %s"
            params.append(file_unique_id)
        
        if entity_type:
            query += " AND entity_type = %s"
            params.append(entity_type)
        
        if entity_id:
            query += " AND entity_id = %s"
            params.append(entity_id)
        
        query += " ORDER BY created_at DESC"
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "id": row[0],
                "file_unique_id": row[1],
                "entity_type": row[2],
                "entity_id": row[3],
                "mapping_type": row[4],
                "mapping_data": row[5],
                "created_at": row[6].isoformat() if row[6] else "",
                "updated_at": row[7].isoformat() if row[7] else ""
            })
        
        return result
    except Exception as e:
        raise e
    finally:
        cur.close()
        conn.close()

def update_file_mapping(mapping_id, mapping_data):
    """
    更新文件映射数据
    
    Args:
        mapping_id (int): 映射记录ID
        mapping_data (dict): 新的映射数据
    
    Returns:
        bool: 更新是否成功
    """
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        cur.execute("""
            UPDATE file_mappings
            SET mapping_data = %s, updated_at = %s
            WHERE id = %s
        """, (
            json.dumps(mapping_data) if mapping_data else None,
            datetime.now(),
            mapping_id
        ))
        
        affected_rows = cur.rowcount
        conn.commit()
        return affected_rows > 0
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()

def delete_file_mapping(mapping_id):
    """
    删除文件映射
    
    Args:
        mapping_id (int): 映射记录ID
    
    Returns:
        bool: 删除是否成功
    """
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        cur.execute("""
            DELETE FROM file_mappings
            WHERE id = %s
        """, (mapping_id,))
        
        affected_rows = cur.rowcount
        conn.commit()
        return affected_rows > 0
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()