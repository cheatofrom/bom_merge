# BOM合并系统安装指南

本文档提供了BOM合并系统的详细安装和部署步骤。

## 系统要求

- Python 3.8+
- Node.js 14+
- PostgreSQL 12+

## 数据库设置

1. 安装PostgreSQL数据库

2. 创建数据库和用户

```sql
CREATE DATABASE bom_db;
CREATE USER bom_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE bom_db TO bom_user;
```

3. 导入表结构

```bash
psql -U bom_user -d bom_db -f parts_library.sql
psql -U bom_user -d bom_db -f project_notes.sql
```

## 后端设置

1. 进入后端目录

```bash
cd hd
```

2. 创建虚拟环境（可选但推荐）

```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows
```

3. 安装依赖

```bash
pip install fastapi uvicorn pandas psycopg2-binary python-multipart
```

4. 配置数据库连接

```bash
cp db.example.py db.py
# 编辑db.py文件，填入正确的数据库连接信息
```

5. 启动后端服务

```bash
python main.py
```

服务将在 http://0.0.0.0:8596 上运行

## 前端设置

1. 进入前端目录

```bash
cd fronted
```

2. 安装依赖

```bash
npm install
```

3. 配置API地址（如需要）

编辑 `src/services/api.ts` 文件，修改 `API_BASE_URL` 为后端服务地址

4. 开发模式运行

```bash
npm start
```

5. 构建生产版本

```bash
npm run build
```

## 生产环境部署

### 后端部署

推荐使用Gunicorn和Nginx部署FastAPI应用：

1. 安装Gunicorn

```bash
pip install gunicorn
```

2. 启动应用

```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8596
```

3. 配置Nginx反向代理（可选）

```nginx
server {
    listen 80;
    server_name your_domain.com;

    location /api/ {
        proxy_pass http://127.0.0.1:8596/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        root /path/to/fronted/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

### 前端部署

1. 构建前端

```bash
cd fronted
npm run build
```

2. 将build目录下的文件部署到Web服务器

## 常见问题

1. **数据库连接失败**
   - 检查db.py中的连接信息是否正确
   - 确认PostgreSQL服务是否运行
   - 检查防火墙设置是否允许数据库连接

2. **Excel导入失败**
   - 确保Excel文件格式正确，最好包含名为"BOM"的工作表
   - 检查Excel文件是否包含必要的列信息

3. **前端无法连接后端API**
   - 检查API_BASE_URL是否配置正确
   - 确认后端服务是否正常运行
   - 检查是否存在跨域问题