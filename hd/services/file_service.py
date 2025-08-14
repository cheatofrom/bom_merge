from db import get_connection
import os
import uuid
from datetime import datetime

def save_uploaded_file_info(original_filename, file_size, project_name, file_unique_id, status="imported", rows_imported=0, error_message=None):
    """
    保存上传文件信息到数据库
    
    Args:
        original_filename (str): 原始文件名
        file_size (int): 文件大小(字节)
        project_name (str): 关联的项目名称
        file_unique_id (str): 文件唯一ID
        status (str, optional): 文件状态. 默认为 "imported".
        rows_imported (int, optional): 导入的行数. 默认为 0.
        error_message (str, optional): 错误信息. 默认为 None.
    
    Returns:
        int: 新插入记录的ID
    """
    # 获取文件类型
    file_type = os.path.splitext(original_filename)[1].lstrip('.')
    
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        # 插入文件信息
        cur.execute("""
            INSERT INTO uploaded_files (
                file_unique_id, original_filename, file_size, file_type,
                upload_time, project_name, status, rows_imported, error_message
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            file_unique_id, original_filename, file_size, file_type,
            datetime.now(), project_name, status, rows_imported, error_message
        ))
        
        file_id = cur.fetchone()[0]
        conn.commit()
        return file_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()

def get_uploaded_files(project_name=None):
    """
    获取上传文件列表
    
    Args:
        project_name (str, optional): 项目名称过滤. 默认为 None.
    
    Returns:
        list: 文件信息列表
    """
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        if project_name:
            cur.execute("""
                SELECT id, file_unique_id, original_filename, file_size, file_type,
                       upload_time, project_name, status, rows_imported, error_message
                FROM uploaded_files
                WHERE project_name = %s
                ORDER BY upload_time DESC
            """, (project_name,))
        else:
            cur.execute("""
                SELECT id, file_unique_id, original_filename, file_size, file_type,
                       upload_time, project_name, status, rows_imported, error_message
                FROM uploaded_files
                ORDER BY upload_time DESC
            """)
        
        rows = cur.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "id": row[0],
                "file_unique_id": row[1],
                "original_filename": row[2],
                "file_size": row[3],
                "file_type": row[4],
                "upload_time": row[5].isoformat() if row[5] else "",
                "project_name": row[6],
                "status": row[7],
                "rows_imported": row[8],
                "error_message": row[9],
                "created_at": "",  # 确保返回空字符串而不是None
                "updated_at": ""
            })
        
        return result
    except Exception as e:
        raise e
    finally:
        cur.close()
        conn.close()

def get_uploaded_file(file_unique_id):
    """
    获取单个上传文件信息
    
    Args:
        file_unique_id (str): 文件唯一ID
    
    Returns:
        dict: 文件信息
    """
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        cur.execute("""
            SELECT id, file_unique_id, original_filename, file_size, file_type,
                   upload_time, project_name, status, rows_imported, error_message
            FROM uploaded_files
            WHERE file_unique_id = %s
        """, (file_unique_id,))
        
        row = cur.fetchone()
        
        if not row:
            return None
        
        return {
            "id": row[0],
            "file_unique_id": row[1],
            "original_filename": row[2],
            "file_size": row[3],
            "file_type": row[4],
            "upload_time": row[5].isoformat() if row[5] else "",
            "project_name": row[6],
            "status": row[7],
            "rows_imported": row[8],
            "error_message": row[9],
            "created_at": "",  # 确保返回空字符串而不是None
            "updated_at": ""  # 确保返回空字符串而不是None
        }
    except Exception as e:
        raise e
    finally:
        cur.close()
        conn.close()

def update_file_name(file_unique_id, new_filename):
    """
    更新文件名
    
    Args:
        file_unique_id (str): 文件唯一ID
        new_filename (str): 新的文件名
    
    Returns:
        bool: 更新是否成功
    """
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        # 更新文件名
        cur.execute("""
            UPDATE uploaded_files
            SET original_filename = %s
            WHERE file_unique_id = %s
            RETURNING id
        """, (new_filename, file_unique_id))
        
        row = cur.fetchone()
        conn.commit()
        
        # 如果找到并更新了记录，返回True
        return row is not None
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()

def update_project_name(file_unique_id, new_project_name):
    """
    更新项目名称
    
    Args:
        file_unique_id (str): 文件唯一ID
        new_project_name (str): 新的项目名称
    
    Returns:
        bool: 更新是否成功
    """
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        # 首先获取旧的项目名称，用于更新merged_projects表
        cur.execute("""
            SELECT project_name FROM uploaded_files
            WHERE file_unique_id = %s
        """, (file_unique_id,))
        
        old_project_name_row = cur.fetchone()
        if not old_project_name_row:
            return False
            
        old_project_name = old_project_name_row[0]
        
        # 更新uploaded_files表中的项目名称
        cur.execute("""
            UPDATE uploaded_files
            SET project_name = %s
            WHERE file_unique_id = %s
            RETURNING id
        """, (new_project_name, file_unique_id))
        
        row = cur.fetchone()
        
        # 如果找到并更新了uploaded_files表中的记录
        if row is not None:
            # 同时更新parts_library表中的项目名称
            cur.execute("""
                UPDATE parts_library
                SET project_name = %s
                WHERE file_unique_id = %s
            """, (new_project_name, file_unique_id))
            
            # 更新merged_projects表中source_projects数组中的项目名称
            cur.execute("""
                UPDATE merged_projects
                SET source_projects = array_replace(source_projects, %s, %s)
                WHERE %s = ANY(source_projects)
            """, (old_project_name, new_project_name, old_project_name))
            
            conn.commit()
            return True
        else:
            conn.rollback()
            return False
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()