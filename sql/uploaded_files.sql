-- 创建上传文件表
CREATE TABLE uploaded_files (
    id SERIAL PRIMARY KEY,                -- 主键ID
    file_unique_id TEXT NOT NULL,         -- 文件唯一ID
    original_filename TEXT NOT NULL,      -- 原始文件名
    file_size INTEGER NOT NULL,           -- 文件大小(字节)
    file_type TEXT NOT NULL,              -- 文件类型(如xlsx, xls)
    upload_time TIMESTAMP DEFAULT NOW(),  -- 上传时间
    project_name TEXT NOT NULL,          -- 关联的项目名称
    status TEXT NOT NULL,                -- 文件状态(如imported, failed)
    rows_imported INTEGER DEFAULT 0,      -- 导入的行数
    error_message TEXT                    -- 错误信息(如果有)
);

-- 表注释
COMMENT ON TABLE uploaded_files IS '上传文件表';

-- 列注释
COMMENT ON COLUMN uploaded_files.id IS '主键ID';
COMMENT ON COLUMN uploaded_files.file_unique_id IS '文件唯一ID';
COMMENT ON COLUMN uploaded_files.original_filename IS '原始文件名';
COMMENT ON COLUMN uploaded_files.file_size IS '文件大小(字节)';
COMMENT ON COLUMN uploaded_files.file_type IS '文件类型(如xlsx, xls)';
COMMENT ON COLUMN uploaded_files.upload_time IS '上传时间';
COMMENT ON COLUMN uploaded_files.project_name IS '关联的项目名称';
COMMENT ON COLUMN uploaded_files.status IS '文件状态(如imported, failed)';
COMMENT ON COLUMN uploaded_files.rows_imported IS '导入的行数';
COMMENT ON COLUMN uploaded_files.error_message IS '错误信息(如果有)';

-- 创建索引
CREATE INDEX idx_uploaded_files_file_unique_id ON uploaded_files(file_unique_id);
CREATE INDEX idx_uploaded_files_project_name ON uploaded_files(project_name);
CREATE INDEX idx_uploaded_files_upload_time ON uploaded_files(upload_time);