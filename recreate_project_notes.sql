-- 重新创建项目备注表
CREATE TABLE project_notes (
    id SERIAL PRIMARY KEY,                -- 主键ID
    project_name TEXT NOT NULL,          -- 项目名称
    file_unique_id TEXT,                 -- 文件唯一ID
    note TEXT,                           -- 项目备注
    created_at TIMESTAMP DEFAULT NOW(),  -- 创建时间
    updated_at TIMESTAMP DEFAULT NOW()   -- 更新时间
);

-- 表注释
COMMENT ON TABLE project_notes IS '项目备注表';

-- 列注释
COMMENT ON COLUMN project_notes.id IS '主键ID';
COMMENT ON COLUMN project_notes.project_name IS '项目名称';
COMMENT ON COLUMN project_notes.file_unique_id IS '文件唯一ID';
COMMENT ON COLUMN project_notes.note IS '项目备注';
COMMENT ON COLUMN project_notes.created_at IS '创建时间';
COMMENT ON COLUMN project_notes.updated_at IS '更新时间';

-- 创建唯一索引确保每个文件唯一ID只有一条备注记录
CREATE UNIQUE INDEX idx_project_notes_file_unique_id ON project_notes(file_unique_id);