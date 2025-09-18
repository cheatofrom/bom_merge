-- 删除user_project_permissions表的脚本
-- 执行前请确保：
-- 1. 所有数据已迁移到user_category_permissions表
-- 2. 所有代码引用已更新
-- 3. 已备份重要数据

-- 删除依赖该表的视图（如果存在）
DROP VIEW IF EXISTS user_permissions_overview;

-- 删除表的索引（会随表一起删除，但明确列出以便确认）
-- DROP INDEX IF EXISTS idx_user_project_permissions_user_id;
-- DROP INDEX IF EXISTS idx_user_project_permissions_file_id;
-- DROP INDEX IF EXISTS idx_user_project_permissions_merged_project_id;
-- DROP INDEX IF EXISTS idx_user_project_permissions_category_id;

-- 删除user_project_permissions表
DROP TABLE IF EXISTS user_project_permissions;

-- 重新创建更新后的用户权限概览视图
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

SELECT 'user_project_permissions表已成功删除，权限系统已完全迁移到user_category_permissions表' as result;