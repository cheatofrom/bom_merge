CREATE TABLE parts_library (
    id SERIAL PRIMARY KEY,                -- 主键ID
    level TEXT,                          -- 层级
    part_code TEXT,                      -- 零件号
    part_name TEXT,                      -- 零件名称
    spec TEXT,                           -- 规格
    version TEXT,                        -- 版本号
    material TEXT,                       -- 材料
    unit_count_per_level TEXT,            -- 单层级用量
    unit_weight_kg TEXT,                 -- 单件重量(kg)
    total_weight_kg NUMERIC(10,3),       -- 总成重量(kg)
    part_property TEXT,                  -- 零件属性
    drawing_size TEXT,                   -- 图幅
    reference_number TEXT,               -- 参图号
    purchase_status TEXT,                -- 采购状态
    process_route TEXT,                  -- 工艺路线
    remark TEXT,                         -- 备注
    upload_batch TEXT,                   -- 上传批次
    project_name TEXT,                   -- 文件名字
    file_unique_id TEXT,                 -- 文件唯一ID
    created_at TIMESTAMP DEFAULT NOW()   -- 创建时间
);

-- 表注释
COMMENT ON TABLE parts_library IS '零件库表';

-- 列注释
COMMENT ON COLUMN parts_library.id IS '主键ID';
COMMENT ON COLUMN parts_library.level IS '层级';
COMMENT ON COLUMN parts_library.part_code IS '零件号';
COMMENT ON COLUMN parts_library.part_name IS '零件名称';
COMMENT ON COLUMN parts_library.spec IS '规格';
COMMENT ON COLUMN parts_library.version IS '版本号';
COMMENT ON COLUMN parts_library.material IS '材料';
COMMENT ON COLUMN parts_library.unit_count_per_level IS '单层级用量';
COMMENT ON COLUMN parts_library.unit_weight_kg IS '单件重量(kg)';
COMMENT ON COLUMN parts_library.total_weight_kg IS '总成重量(kg)';
COMMENT ON COLUMN parts_library.part_property IS '零件属性';
COMMENT ON COLUMN parts_library.drawing_size IS '图幅';
COMMENT ON COLUMN parts_library.reference_number IS '参图号';
COMMENT ON COLUMN parts_library.purchase_status IS '采购状态';
COMMENT ON COLUMN parts_library.process_route IS '工艺路线';
COMMENT ON COLUMN parts_library.remark IS '备注';
COMMENT ON COLUMN parts_library.upload_batch IS '上传批次';
COMMENT ON COLUMN parts_library.project_name IS '文件名字';
COMMENT ON COLUMN parts_library.file_unique_id IS '文件唯一ID';
COMMENT ON COLUMN parts_library.created_at IS '创建时间';
