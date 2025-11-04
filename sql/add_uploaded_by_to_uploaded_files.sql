-- 为uploaded_files表添加上传者字段的迁移脚本
-- 创建时间: 2024

-- 添加上传者字段
ALTER TABLE uploaded_files 
ADD COLUMN uploaded_by INTEGER REFERENCES users(id);

-- 添加索引以提高查询性能
CREATE INDEX idx_uploaded_files_uploaded_by ON uploaded_files(uploaded_by);

-- 添加列注释
COMMENT ON COLUMN uploaded_files.uploaded_by IS '上传者用户ID';

-- 为现有记录设置默认上传者（可选，如果有默认管理员用户）
-- UPDATE uploaded_files SET uploaded_by = 1 WHERE uploaded_by IS NULL;

-- 如果需要，可以将字段设为非空（在设置默认值后）
-- ALTER TABLE uploaded_files ALTER COLUMN uploaded_by SET NOT NULL;