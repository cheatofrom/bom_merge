-- 为合并项目表添加创建人字段的迁移脚本
-- 创建时间: 2024

-- 添加创建人字段
ALTER TABLE merged_projects 
ADD COLUMN created_by INTEGER REFERENCES users(id);

-- 添加索引以提高查询性能
CREATE INDEX idx_merged_projects_created_by ON merged_projects(created_by);

-- 添加列注释
COMMENT ON COLUMN merged_projects.created_by IS '创建者用户ID';

-- 为现有记录设置默认创建者（可选，如果有默认管理员用户）
-- UPDATE merged_projects SET created_by = 1 WHERE created_by IS NULL;

-- 如果需要，可以将字段设为非空（在设置默认值后）
-- ALTER TABLE merged_projects ALTER COLUMN created_by SET NOT NULL;