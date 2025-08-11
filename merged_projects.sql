-- 创建合并项目表
CREATE TABLE merged_projects (
    id SERIAL PRIMARY KEY,                -- 主键ID
    merged_project_name TEXT NOT NULL,    -- 合并后的项目名称
    source_projects TEXT[],               -- 源项目名称数组
    created_at TIMESTAMP DEFAULT NOW(),   -- 创建时间
    updated_at TIMESTAMP DEFAULT NOW()    -- 更新时间
);

-- 创建合并零部件表
CREATE TABLE merged_parts (
    id SERIAL PRIMARY KEY,                -- 主键ID
    merged_project_id INTEGER REFERENCES merged_projects(id), -- 关联的合并项目ID
    level INTEGER,                       -- 层级
    part_code TEXT,                      -- 零件号
    part_name TEXT,                      -- 零件名称
    spec TEXT,                           -- 规格
    version TEXT,                        -- 版本号
    material TEXT,                       -- 材料
    unit_count_per_level TEXT,           -- 单层级用量
    unit_weight_kg TEXT,                 -- 单件重量(kg)
    total_weight_kg NUMERIC(10,3),       -- 总成重量(kg)
    part_property TEXT,                  -- 零件属性
    drawing_size TEXT,                   -- 图幅
    reference_number TEXT,               -- 参图号
    purchase_status TEXT,                -- 采购状态
    process_route TEXT,                  -- 工艺路线
    remark TEXT,                         -- 备注
    created_at TIMESTAMP DEFAULT NOW(),  -- 创建时间
    updated_at TIMESTAMP DEFAULT NOW()   -- 更新时间
);

-- 表注释
COMMENT ON TABLE merged_projects IS '合并项目表';
COMMENT ON TABLE merged_parts IS '合并零部件表';

-- 列注释
COMMENT ON COLUMN merged_projects.id IS '主键ID';
COMMENT ON COLUMN merged_projects.merged_project_name IS '合并后的项目名称';
COMMENT ON COLUMN merged_projects.source_projects IS '源项目名称数组';
COMMENT ON COLUMN merged_projects.created_at IS '创建时间';
COMMENT ON COLUMN merged_projects.updated_at IS '更新时间';

COMMENT ON COLUMN merged_parts.id IS '主键ID';
COMMENT ON COLUMN merged_parts.merged_project_id IS '关联的合并项目ID';
COMMENT ON COLUMN merged_parts.level IS '层级';
COMMENT ON COLUMN merged_parts.part_code IS '零件号';
COMMENT ON COLUMN merged_parts.part_name IS '零件名称';
COMMENT ON COLUMN merged_parts.spec IS '规格';
COMMENT ON COLUMN merged_parts.version IS '版本号';
COMMENT ON COLUMN merged_parts.material IS '材料';
COMMENT ON COLUMN merged_parts.unit_count_per_level IS '单层级用量';
COMMENT ON COLUMN merged_parts.unit_weight_kg IS '单件重量(kg)';
COMMENT ON COLUMN merged_parts.total_weight_kg IS '总成重量(kg)';
COMMENT ON COLUMN merged_parts.part_property IS '零件属性';
COMMENT ON COLUMN merged_parts.drawing_size IS '图幅';
COMMENT ON COLUMN merged_parts.reference_number IS '参图号';
COMMENT ON COLUMN merged_parts.purchase_status IS '采购状态';
COMMENT ON COLUMN merged_parts.process_route IS '工艺路线';
COMMENT ON COLUMN merged_parts.remark IS '备注';
COMMENT ON COLUMN merged_parts.created_at IS '创建时间';
COMMENT ON COLUMN merged_parts.updated_at IS '更新时间';

-- 创建索引
CREATE INDEX idx_merged_parts_project_id ON merged_parts(merged_project_id);
CREATE INDEX idx_merged_parts_part_code ON merged_parts(part_code);