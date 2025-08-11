-- 为merged_projects表添加source_file_ids字段
ALTER TABLE merged_projects ADD COLUMN IF NOT EXISTS source_file_ids TEXT[] DEFAULT NULL;

-- 更新表注释
COMMENT ON COLUMN merged_projects.source_file_ids IS '源文件唯一ID列表，用于通过文件ID而不是项目名称进行合并';