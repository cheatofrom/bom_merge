-- 修改merged_parts表的level字段类型从INTEGER改为TEXT
ALTER TABLE merged_parts 
ALTER COLUMN level TYPE TEXT USING level::TEXT;

-- 更新列注释
COMMENT ON COLUMN merged_parts.level IS '层级（字符串类型）';