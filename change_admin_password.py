#!/usr/bin/env python3
"""
修改管理员账户密码的脚本
"""
import bcrypt
import psycopg2
import getpass
import sys
import os
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("password_change")

def get_db_connection():
    """获取数据库连接"""
    try:
        # 使用项目中的数据库配置
        db_host = "192.168.1.66"
        db_port = "7432"
        db_name = "zxb"
        db_user = "root"
        db_password = "123456"
        
        # 打印连接信息
        logger.info(f"正在连接数据库: {db_host}:{db_port}/{db_name}")
        
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            dbname=db_name,
            user=db_user,
            password=db_password
        )
        return conn
    except psycopg2.Error as e:
        logger.error(f"数据库连接错误: {e}")
        sys.exit(1)

def hash_password(password):
    """对密码进行哈希处理"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def change_admin_password(username='admin', new_password=None):
    """修改管理员密码"""
    if not new_password:
        # 如果没有提供密码，则提示用户输入
        new_password = getpass.getpass("请输入新的管理员密码: ")
        confirm_password = getpass.getpass("请再次输入新密码确认: ")
        
        if new_password != confirm_password:
            logger.error("两次输入的密码不一致，请重新运行脚本")
            return False
        
        if len(new_password) < 6:
            logger.error("密码长度不能少于6个字符")
            return False
    
    # 对密码进行哈希处理
    password_hash = hash_password(new_password)
    
    try:
        # 连接数据库
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 检查用户是否存在
        cursor.execute("SELECT id FROM users WHERE username = %s AND role = 'admin'", (username,))
        user = cursor.fetchone()
        
        if not user:
            logger.error(f"未找到管理员用户: {username}")
            return False
        
        # 更新密码
        cursor.execute(
            "UPDATE users SET password_hash = %s, updated_at = CURRENT_TIMESTAMP WHERE username = %s AND role = 'admin'",
            (password_hash, username)
        )
        
        # 提交事务
        conn.commit()
        
        logger.info(f"管理员 {username} 的密码已成功更新")
        return True
        
    except psycopg2.Error as e:
        logger.error(f"更新密码时发生错误: {e}")
        return False
    finally:
        if 'conn' in locals() and conn:
            conn.close()

def main():
    """主函数"""
    print("=== 管理员密码修改工具 ===")
    
    # 如果命令行参数提供了用户名，则使用该用户名
    username = 'admin'
    if len(sys.argv) > 1:
        username = sys.argv[1]
        print(f"将修改用户 {username} 的密码")
    else:
        print("将修改默认管理员(admin)的密码")
    
    # 修改密码
    success = change_admin_password(username)
    
    if success:
        print("密码修改成功！")
    else:
        print("密码修改失败，请检查日志获取详细信息")

if __name__ == "__main__":
    main()