-- 为parts_library表添加file_unique_id字段
ALTER TABLE parts_library ADD COLUMN IF NOT EXISTS file_unique_id TEXT;

-- 为file_unique_id字段添加注释
COMMENT ON COLUMN parts_library.file_unique_id IS '文件唯一ID';

-- 为现有记录设置默认值（使用随机UUID）
UPDATE parts_library SET file_unique_id = gen_random_uuid()::text WHERE file_unique_id IS NULL;