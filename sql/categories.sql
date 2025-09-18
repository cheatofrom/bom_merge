-- 创建项目分类表
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,                -- 主键ID
    name VARCHAR(100) NOT NULL UNIQUE,   -- 分类名称
    description TEXT,                     -- 分类描述
    color VARCHAR(7) DEFAULT '#3B82F6',  -- 分类颜色(十六进制)
    created_at TIMESTAMP DEFAULT NOW(),  -- 创建时间
    updated_at TIMESTAMP DEFAULT NOW()   -- 更新时间
);

-- 表注释
COMMENT ON TABLE categories IS '项目分类表';

-- 列注释
COMMENT ON COLUMN categories.id IS '主键ID';
COMMENT ON COLUMN categories.name IS '分类名称';
COMMENT ON COLUMN categories.description IS '分类描述';
COMMENT ON COLUMN categories.color IS '分类颜色(十六进制)';
COMMENT ON COLUMN categories.created_at IS '创建时间';
COMMENT ON COLUMN categories.updated_at IS '更新时间';

-- 创建索引
CREATE INDEX idx_categories_name ON categories(name);
CREATE INDEX idx_categories_created_at ON categories(created_at);

-- 创建项目分类关联表
CREATE TABLE project_categories (
    id SERIAL PRIMARY KEY,                -- 主键ID
    project_name TEXT NOT NULL,          -- 项目名称
    file_unique_id TEXT NOT NULL,        -- 文件唯一ID
    category_id INTEGER NOT NULL,        -- 分类ID
    created_at TIMESTAMP DEFAULT NOW(),  -- 创建时间
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- 表注释
COMMENT ON TABLE project_categories IS '项目分类关联表';

-- 列注释
COMMENT ON COLUMN project_categories.id IS '主键ID';
COMMENT ON COLUMN project_categories.project_name IS '项目名称';
COMMENT ON COLUMN project_categories.file_unique_id IS '文件唯一ID';
COMMENT ON COLUMN project_categories.category_id IS '分类ID';
COMMENT ON COLUMN project_categories.created_at IS '创建时间';

-- 创建索引
CREATE INDEX idx_project_categories_project_name ON project_categories(project_name);
CREATE INDEX idx_project_categories_file_unique_id ON project_categories(file_unique_id);
CREATE INDEX idx_project_categories_category_id ON project_categories(category_id);
CREATE UNIQUE INDEX idx_project_categories_unique ON project_categories(project_name, file_unique_id);

-- 添加更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为categories表添加更新时间触发器
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认分类数据
INSERT INTO categories (name, description, color) VALUES
('默认分类', '系统默认分类', '#6B7280'),
('机械设计', '机械零件和装配相关项目', '#3B82F6'),
('电子电气', '电子电路和电气系统相关项目', '#10B981'),
('软件开发', '软件和程序开发相关项目', '#8B5CF6'),
('测试验证', '测试和验证相关项目', '#F59E0B');