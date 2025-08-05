# BOM合并系统

## 项目简介

BOM合并系统是一个用于管理和合并多个项目物料清单(BOM)的Web应用程序。该系统允许用户上传Excel格式的BOM文件，管理多个项目的零部件信息，并提供合并查看不同项目零部件的功能。系统还支持为每个项目添加备注，方便用户记录项目相关信息。

## 系统功能

- **Excel文件导入**：支持上传Excel格式的BOM文件，自动解析并导入数据库
- **项目管理**：查看所有已导入的项目列表
- **项目备注**：为每个项目添加、编辑和查看备注信息
- **零部件合并**：选择多个项目，合并查看所有零部件信息
- **搜索功能**：在合并的零部件列表中搜索特定零件
- **分页显示**：大数据量时支持分页浏览

## 技术栈

### 前端

- React
- TypeScript
- React Router
- Axios
- Tailwind CSS

### 后端

- Python
- FastAPI
- PostgreSQL
- Pandas (用于Excel处理)

## 系统架构

系统采用前后端分离架构：

- 前端：React单页应用，负责用户界面和交互
- 后端：FastAPI提供RESTful API服务
- 数据库：PostgreSQL存储项目和零部件数据

## 数据模型

系统包含两个主要数据表：

1. **parts_library**：存储零部件信息
   - 包含层级、零件号、零件名称、规格、版本号等字段
   - 记录项目名称和上传批次信息

2. **project_notes**：存储项目备注信息
   - 项目名称
   - 备注内容
   - 创建和更新时间

## 安装与部署

### 前端部署

```bash
# 进入前端目录
cd fronted

# 安装依赖
npm install

# 开发模式运行
npm start

# 构建生产版本
npm run build
```

### 后端部署

```bash
# 安装依赖
pip install fastapi uvicorn pandas psycopg2-binary python-multipart

# 运行服务
cd hd
python main.py
```

### 数据库配置

1. 创建PostgreSQL数据库
2. 执行`parts_library.sql`和`project_notes.sql`创建表结构
3. 在`hd/db.py`中配置数据库连接信息

## 使用说明

1. **上传BOM文件**：在首页点击"上传Excel文件"按钮，选择BOM格式的Excel文件上传
2. **添加项目备注**：在项目卡片中点击"添加备注"，输入并保存项目相关信息
3. **合并查看**：选择一个或多个项目，点击"合并选中项目"按钮查看所有零部件
4. **搜索零件**：在合并页面使用搜索框，根据零件名称筛选零部件

## 注意事项

- Excel文件格式要求：系统会优先查找名为"BOM"的工作表，如果没有则使用第三个或第一个工作表
- 系统会自动映射Excel列到标准字段，确保Excel文件包含必要的零部件信息
- 数据库连接信息需要根据实际环境进行配置

## 许可证

[MIT](LICENSE)