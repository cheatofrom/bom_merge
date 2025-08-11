-- 创建文件映射表
CREATE TABLE file_mappings (
    id SERIAL PRIMARY KEY,                -- 主键ID
    file_unique_id TEXT NOT NULL,         -- 文件唯一ID，关联uploaded_files表
    entity_type TEXT NOT NULL,            -- 实体类型，如'project'、'part'等
    entity_id TEXT NOT NULL,              -- 实体ID
    mapping_type TEXT NOT NULL,           -- 映射类型
    mapping_data JSONB,                   -- 映射数据，使用JSONB存储灵活的映射信息
    created_at TIMESTAMP DEFAULT NOW(),   -- 创建时间
    updated_at TIMESTAMP DEFAULT NOW()    -- 更新时间
);

-- 表注释
COMMENT ON TABLE file_mappings IS '文件映射表';

-- 列注释
COMMENT ON COLUMN file_mappings.id IS '主键ID';
COMMENT ON COLUMN file_mappings.file_unique_id IS '文件唯一ID，关联uploaded_files表';
COMMENT ON COLUMN file_mappings.entity_type IS '实体类型，如project、part等';
COMMENT ON COLUMN file_mappings.entity_id IS '实体ID';
COMMENT ON COLUMN file_mappings.mapping_type IS '映射类型';
COMMENT ON COLUMN file_mappings.mapping_data IS '映射数据，使用JSONB存储灵活的映射信息';
COMMENT ON COLUMN file_mappings.created_at IS '创建时间';
COMMENT ON COLUMN file_mappings.updated_at IS '更新时间';

-- 创建索引
CREATE INDEX idx_file_mappings_file_unique_id ON file_mappings(file_unique_id);
CREATE INDEX idx_file_mappings_entity ON file_mappings(entity_type, entity_id);