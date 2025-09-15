-- 迁移脚本：为现有表添加分类支持
-- 执行日期：2024年

-- 1. 为uploaded_files表添加category_id字段
ALTER TABLE uploaded_files ADD COLUMN category_id INTEGER;

-- 2. 添加外键约束（可选，如果需要强制引用完整性）
-- ALTER TABLE uploaded_files ADD CONSTRAINT fk_uploaded_files_category 
--     FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

-- 3. 为uploaded_files表的category_id字段添加索引
CREATE INDEX idx_uploaded_files_category_id ON uploaded_files(category_id);

-- 4. 添加列注释
COMMENT ON COLUMN uploaded_files.category_id IS '关联的分类ID';

-- 5. 为现有数据设置默认分类（假设默认分类ID为1）
-- UPDATE uploaded_files SET category_id = 1 WHERE category_id IS NULL;

-- 注意：
-- 1. 外键约束被注释掉了，因为可能存在分类被删除但文件仍需保留的情况
-- 2. 现有数据的默认分类更新被注释掉了，可根据需要手动执行
-- 3. 建议在生产环境执行前先备份数据库