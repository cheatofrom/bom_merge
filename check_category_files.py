#!/usr/bin/env python3
from db import get_db_connection
from psycopg2.extras import RealDictCursor

def check_category_files():
    """检查分类文件信息（带连接管理优化）"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            try:
                print("=== 检查分类信息 ===")
                cursor.execute("SELECT * FROM categories ORDER BY id")
                categories = cursor.fetchall()
                for cat in categories:
                    print(f"分类ID: {cat['id']}, 名称: {cat['name']}")
                
                print("\n=== 检查上传文件的分类信息 ===")
                cursor.execute("SELECT file_unique_id, original_filename, category_id FROM uploaded_files ORDER BY file_unique_id")
                files = cursor.fetchall()
                for file in files:
                    print(f"文件ID: {file['file_unique_id']}, 文件名: {file['original_filename']}, 分类ID: {file['category_id']}")
                
                print("\n=== 检查分类ID=2下的文件 ===")
                cursor.execute(
                    "SELECT file_unique_id, original_filename FROM uploaded_files WHERE category_id = 2"
                )
                category_files = cursor.fetchall()
                print(f"分类ID=2下的文件数量: {len(category_files)}")
                for file in category_files:
                    print(f"  - 文件ID: {file['file_unique_id']}, 文件名: {file['original_filename']}")
                
                print("\n=== 检查用户权限 ===")
                cursor.execute(
                    "SELECT * FROM user_category_permissions WHERE user_id = 2"
                )
                permissions = cursor.fetchall()
                for perm in permissions:
                    print(f"权限ID: {perm['id']}, 分类ID: {perm['category_id']}, 权限: {perm['permission_type']}")
            finally:
                cursor.close()
                
    except Exception as e:
        print(f"检查出错: {e}")

if __name__ == "__main__":
    check_category_files()