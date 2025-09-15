from db import get_connection, get_db_connection, get_async_db_connection
import os
import uuid
from datetime import datetime

def save_uploaded_file_info(original_filename, file_size, project_name, file_unique_id, status="imported", rows_imported=0, error_message=None, category_id=None):
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
    
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            
            # 插入文件信息
            cur.execute("""
                INSERT INTO uploaded_files (
                    file_unique_id, original_filename, file_size, file_type,
                    upload_time, project_name, status, rows_imported, error_message, category_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                file_unique_id, original_filename, file_size, file_type,
                datetime.now(), project_name, status, rows_imported, error_message, category_id
            ))
            
            file_id = cur.fetchone()[0]
            conn.commit()
            cur.close()
            return file_id
    except Exception as e:
        raise e

async def save_uploaded_file_info_async(original_filename, file_size, project_name, file_unique_id, status="imported", rows_imported=0, error_message=None, category_id=None):
    """
    异步保存上传文件信息到数据库
    
    Args:
        original_filename (str): 原始文件名
        file_size (int): 文件大小(字节)
        project_name (str): 关联的项目名称
        file_unique_id (str): 文件唯一ID
        status (str, optional): 文件状态. 默认为 "imported".
        rows_imported (int, optional): 导入的行数. 默认为 0.
        error_message (str, optional): 错误信息. 默认为 None.
        category_id (int, optional): 分类ID. 默认为 None.
    
    Returns:
        int: 新插入记录的ID
    """
    # 获取文件类型
    file_type = os.path.splitext(original_filename)[1].lstrip('.')
    
    try:
        print(f"开始保存文件信息到数据库 - 文件: {original_filename}, 分类ID: {category_id}")
        
        async with get_async_db_connection() as conn:
            print(f"执行SQL插入 - 参数: file_unique_id={file_unique_id}, category_id={category_id}")
            
            # 插入文件信息
            result = await conn.fetchrow("""
                INSERT INTO uploaded_files (
                    file_unique_id, original_filename, file_size, file_type,
                    upload_time, project_name, status, rows_imported, error_message, category_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            """, 
                file_unique_id, original_filename, file_size, file_type,
                datetime.now(), project_name, status, rows_imported, error_message, category_id
            )
            
            print(f"文件信息已成功保存到数据库: {original_filename}, 分类ID: {category_id}")
            return result['id']
    except Exception as e:
        print(f"保存文件信息到数据库失败: {e}, 文件: {original_filename}, 分类ID: {category_id}")
        raise e

def get_uploaded_files(project_name=None):
    """
    获取上传文件列表
    
    Args:
        project_name (str, optional): 项目名称过滤. 默认为 None.
    
    Returns:
        list: 文件信息列表
    """
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            
            if project_name:
                cur.execute("""
                    SELECT id, file_unique_id, original_filename, file_size, file_type,
                           upload_time, project_name, status, rows_imported, error_message, category_id
                    FROM uploaded_files
                    WHERE project_name = %s
                    ORDER BY upload_time DESC
                """, (project_name,))
            else:
                cur.execute("""
                    SELECT id, file_unique_id, original_filename, file_size, file_type,
                           upload_time, project_name, status, rows_imported, error_message, category_id
                    FROM uploaded_files
                    ORDER BY upload_time DESC
                """)
            
            rows = cur.fetchall()
            cur.close()
            
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
                    "category_id": row[10],
                    "created_at": "",  # 确保返回空字符串而不是None
                    "updated_at": ""
                })
            
            return result
    except Exception as e:
        raise e

async def get_uploaded_files_async(project_name=None):
    """
    异步获取上传文件列表
    
    Args:
        project_name (str, optional): 项目名称过滤. 默认为 None.
    
    Returns:
        list: 文件信息列表
    """
    try:
        async with get_async_db_connection() as conn:
            if project_name:
                rows = await conn.fetch("""
                    SELECT id, file_unique_id, original_filename, file_size, file_type,
                           upload_time, project_name, status, rows_imported, error_message, category_id
                    FROM uploaded_files
                    WHERE project_name = $1
                    ORDER BY upload_time DESC
                """, project_name)
            else:
                rows = await conn.fetch("""
                    SELECT id, file_unique_id, original_filename, file_size, file_type,
                           upload_time, project_name, status, rows_imported, error_message, category_id
                    FROM uploaded_files
                    ORDER BY upload_time DESC
                """)
            
            result = []
            for row in rows:
                result.append({
                    "id": row['id'],
                    "file_unique_id": row['file_unique_id'],
                    "original_filename": row['original_filename'],
                    "file_size": row['file_size'],
                    "file_type": row['file_type'],
                    "upload_time": row['upload_time'].isoformat() if row['upload_time'] else "",
                    "project_name": row['project_name'],
                    "status": row['status'],
                    "rows_imported": row['rows_imported'],
                    "error_message": row['error_message'],
                    "category_id": row['category_id'],
                    "created_at": "",  # 确保返回空字符串而不是None
                    "updated_at": ""
                })
            
            return result
    except Exception as e:
        raise e

def get_uploaded_file(file_unique_id):
    """
    获取单个上传文件信息
    
    Args:
        file_unique_id (str): 文件唯一ID
    
    Returns:
        dict: 文件信息
    """
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            
            cur.execute("""
                SELECT id, file_unique_id, original_filename, file_size, file_type,
                       upload_time, project_name, status, rows_imported, error_message, category_id
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
                "category_id": row[10],
                "created_at": "",  # 确保返回空字符串而不是None
                "updated_at": ""  # 确保返回空字符串而不是None
            }
    except Exception as e:
        raise e

async def get_uploaded_file_async(file_unique_id):
    """
    异步获取单个上传文件信息
    
    Args:
        file_unique_id (str): 文件唯一ID
    
    Returns:
        dict: 文件信息
    """
    try:
        async with get_async_db_connection() as conn:
            row = await conn.fetchrow("""
                SELECT id, file_unique_id, original_filename, file_size, file_type,
                       upload_time, project_name, status, rows_imported, error_message, category_id
                FROM uploaded_files
                WHERE file_unique_id = $1
            """, file_unique_id)
            
            if not row:
                return None
            
            return {
                "id": row['id'],
                "file_unique_id": row['file_unique_id'],
                "original_filename": row['original_filename'],
                "file_size": row['file_size'],
                "file_type": row['file_type'],
                "upload_time": row['upload_time'].isoformat() if row['upload_time'] else "",
                "project_name": row['project_name'],
                "status": row['status'],
                "rows_imported": row['rows_imported'],
                "error_message": row['error_message'],
                "category_id": row['category_id'],
                "created_at": "",  # 确保返回空字符串而不是None
                "updated_at": ""  # 确保返回空字符串而不是None
            }
    except Exception as e:
        raise e

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

async def update_file_name_async(file_unique_id, new_filename):
    """
    异步更新文件名
    
    Args:
        file_unique_id (str): 文件唯一ID
        new_filename (str): 新的文件名
    
    Returns:
        bool: 更新是否成功
    """
    try:
        async with get_async_db_connection() as conn:
            # 更新文件名
            result = await conn.execute("""
                UPDATE uploaded_files
                SET original_filename = $1
                WHERE file_unique_id = $2
            """, new_filename, file_unique_id)
            
            # 检查是否有行被更新
            return result.split()[-1] != '0'
    except Exception as e:
        raise e

async def update_project_name_async(file_unique_id, new_project_name):
    """
    异步更新项目名称
    
    Args:
        file_unique_id (str): 文件唯一ID
        new_project_name (str): 新的项目名称
    
    Returns:
        bool: 更新是否成功
    """
    try:
        async with get_async_db_connection() as conn:
            # 首先获取旧的项目名称，用于更新merged_projects表
            old_project_name_row = await conn.fetchrow("""
                SELECT project_name FROM uploaded_files
                WHERE file_unique_id = $1
            """, file_unique_id)
            
            if not old_project_name_row:
                return False
                
            old_project_name = old_project_name_row['project_name']
            
            # 更新uploaded_files表中的项目名称
            result = await conn.execute("""
                UPDATE uploaded_files
                SET project_name = $1
                WHERE file_unique_id = $2
            """, new_project_name, file_unique_id)
            
            # 如果找到并更新了uploaded_files表中的记录
            if result.split()[-1] != '0':
                # 同时更新parts_library表中的项目名称
                await conn.execute("""
                    UPDATE parts_library
                    SET project_name = $1
                    WHERE file_unique_id = $2
                """, new_project_name, file_unique_id)
                
                # 更新merged_projects表中source_projects数组中的项目名称
                await conn.execute("""
                    UPDATE merged_projects
                    SET source_projects = array_replace(source_projects, $1, $2)
                    WHERE $1 = ANY(source_projects)
                """, old_project_name, new_project_name)
                
                return True
            else:
                return False
    except Exception as e:
        raise e

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