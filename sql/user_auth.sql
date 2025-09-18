-- 用户认证和权限管理数据库结构
-- 创建时间: 2024

-- 用户角色枚举类型
CREATE TYPE user_role AS ENUM ('admin', 'user');

-- 用户表
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL, -- 用户名
    email VARCHAR(100) UNIQUE NOT NULL, -- 邮箱
    password_hash VARCHAR(255) NOT NULL, -- 密码哈希
    full_name VARCHAR(100), -- 真实姓名
    role user_role DEFAULT 'user', -- 用户角色
    is_active BOOLEAN DEFAULT TRUE, -- 是否激活
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 更新时间
    last_login TIMESTAMP NULL -- 最后登录时间
);

-- 用户会话表（用于JWT令牌管理）
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL, -- JWT令牌哈希
    expires_at TIMESTAMP NOT NULL, -- 过期时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_revoked BOOLEAN DEFAULT FALSE, -- 是否已撤销
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 权限类型枚举
CREATE TYPE permission_type AS ENUM ('view', 'edit', 'delete', 'admin');

-- 用户项目权限表
CREATE TABLE user_project_permissions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    file_id VARCHAR(50), -- 普通项目文件ID
    merged_project_id INT, -- 合并项目ID
    category_id INT, -- 分类ID
    permission_type permission_type DEFAULT 'view', -- 权限类型
    granted_by INT NOT NULL, -- 授权人ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id),
    CONSTRAINT unique_user_file_permission UNIQUE (user_id, file_id),
    CONSTRAINT unique_user_merged_project_permission UNIQUE (user_id, merged_project_id),
    CONSTRAINT unique_user_category_permission UNIQUE (user_id, category_id)
);

-- 创建索引
CREATE INDEX idx_user_project_permissions_user_id ON user_project_permissions(user_id);
CREATE INDEX idx_user_project_permissions_file_id ON user_project_permissions(file_id);
CREATE INDEX idx_user_project_permissions_merged_project_id ON user_project_permissions(merged_project_id);
CREATE INDEX idx_user_project_permissions_category_id ON user_project_permissions(category_id);

-- 用户操作日志表
CREATE TABLE user_activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(50) NOT NULL, -- 操作类型
    resource_type VARCHAR(50), -- 资源类型
    resource_id VARCHAR(50), -- 资源ID
    details JSONB, -- 操作详情
    ip_address VARCHAR(45), -- IP地址
    user_agent TEXT, -- 用户代理
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX idx_user_activity_logs_action ON user_activity_logs(action);
CREATE INDEX idx_user_activity_logs_created_at ON user_activity_logs(created_at);

-- 插入默认管理员用户（密码: admin123，需要在实际使用时修改）
INSERT INTO users (username, email, password_hash, full_name, role) VALUES 
('admin', 'admin@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PmvlmO', '系统管理员', 'admin');

-- 为现有的uploaded_files表添加用户关联（如果需要）
-- ALTER TABLE uploaded_files ADD COLUMN created_by INT COMMENT '创建者用户ID';
-- ALTER TABLE uploaded_files ADD FOREIGN KEY (created_by) REFERENCES users(id);

-- 为现有的merged_projects表添加用户关联（如果需要）
-- ALTER TABLE merged_projects ADD COLUMN created_by INT COMMENT '创建者用户ID';
-- ALTER TABLE merged_projects ADD FOREIGN KEY (created_by) REFERENCES users(id);

-- 创建视图：用户权限概览
CREATE VIEW user_permissions_overview AS
SELECT 
    u.id as user_id,
    u.username,
    u.full_name,
    u.role,
    ucp.category_id,
    ucp.permission_type,
    ucp.created_at as permission_granted_at
FROM users u
LEFT JOIN user_category_permissions ucp ON u.id = ucp.user_id
WHERE u.is_active = TRUE;