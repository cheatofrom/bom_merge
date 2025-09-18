-- 简化的用户权限表 - 只保留用户与分类的权限关系
CREATE TABLE user_category_permissions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    category_id INT NOT NULL, -- 分类ID
    permission_type permission_type DEFAULT 'view', -- 权限类型
    granted_by INT NOT NULL, -- 授权人ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_category_permission UNIQUE (user_id, category_id)
);

-- 创建索引
CREATE INDEX idx_user_category_permissions_user_id ON user_category_permissions(user_id);
CREATE INDEX idx_user_category_permissions_category_id ON user_category_permissions(category_id);

-- 表注释
COMMENT ON TABLE user_category_permissions IS '用户分类权限表 - 用户通过分类权限访问该分类下的所有文件';
COMMENT ON COLUMN user_category_permissions.user_id IS '用户ID';
COMMENT ON COLUMN user_category_permissions.category_id IS '分类ID';
COMMENT ON COLUMN user_category_permissions.permission_type IS '权限类型：view(查看)、edit(编辑)';
COMMENT ON COLUMN user_category_permissions.granted_by IS '授权人ID';

-- 迁移现有数据（从user_project_permissions表中提取category_id相关的权限）
INSERT INTO user_category_permissions (user_id, category_id, permission_type, granted_by, created_at, updated_at)
SELECT user_id, category_id, permission_type, granted_by, created_at, updated_at
FROM user_project_permissions
WHERE category_id IS NOT NULL
ON CONFLICT (user_id, category_id) DO NOTHING;

-- 可选：删除旧的权限表（请谨慎执行）
-- DROP TABLE user_project_permissions;