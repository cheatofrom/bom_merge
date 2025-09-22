# Docker 容器中多进程的坑：为什么 uvicorn --workers 在容器里不靠谱

## 前言

最近在将 FastAPI 应用容器化时遇到了一个奇怪的问题：本地运行 `python main.py` 时多进程工作正常，但在 Docker 容器中却出现了页面刷新失效、状态丢失等问题。经过深入研究，发现这是 Docker 容器环境下多进程的一个经典陷阱。

## 问题现象

### 本地环境（正常）

```python
# main.py
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8596, workers=4)
```

```bash
python main.py  # 工作完美
```

### Docker 环境（有问题）

```dockerfile
# 尝试1：直接运行 Python 脚本
CMD ["python", "main.py"]

# 尝试2：使用 uvicorn 命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8596", "--workers", "4"]
```

**结果都一样：**
- 用户登录后刷新页面显示未登录
- 会话状态随机丢失
- 缓存数据不一致

## 根本原因分析

### 1. 容器内多进程的状态隔离问题

```bash
# Docker 容器中的进程结构
uvicorn master (PID 1)
├── worker 1 (PID 2) - 独立内存空间
├── worker 2 (PID 3) - 独立内存空间
├── worker 3 (PID 4) - 独立内存空间
└── worker 4 (PID 5) - 独立内存空间
```

**关键问题：每个 worker 进程有完全独立的内存空间！**

```python
# 在 worker 1 中
user_sessions = {"user123": "logged_in"}

# 在 worker 2 中
user_sessions = {}  # 完全独立，看不到 worker 1 的数据！
```

### 2. 负载均衡的随机性

```bash
# 用户的请求流程
第1次请求（登录）-> worker 1  # 登录成功，状态保存在 worker 1
第2次请求（刷新）-> worker 3  # worker 3 没有登录状态，显示未登录！
第3次请求（操作）-> worker 2  # worker 2 也没有状态...
```

### 3. 实际测试验证

```python
# 简单的测试代码
from fastapi import FastAPI
import os

app = FastAPI()

# 进程内存变量
process_data = {}

@app.get("/set/{key}/{value}")
async def set_data(key: str, value: str):
    process_data[key] = value
    return {"pid": os.getpid(), "data": process_data}

@app.get("/get/{key}")
async def get_data(key: str):
    return {"pid": os.getpid(), "data": process_data.get(key, "NOT_FOUND")}
```

**测试结果：**

```bash
curl http://localhost:8596/set/user/john
# {"pid": 25, "data": {"user": "john"}}

curl http://localhost:8596/get/user
# {"pid": 27, "data": "NOT_FOUND"}  # 不同的 PID！
```

## 解决方案对比

### 方案1：外部状态存储（治标）

```python
import redis
from fastapi import FastAPI

app = FastAPI()
# 使用 Redis 存储状态，所有进程共享
redis_client = redis.Redis(host='redis', port=6379)

@app.get("/login")
async def login():
    # 状态存储在 Redis 中，所有 worker 都能访问
    redis_client.set("user_session", "logged_in")
    return {"status": "success"}
```

**优点：** 解决了状态共享问题
**缺点：** 增加了复杂性，需要额外的 Redis 服务

### 方案2：单进程容器（治本，推荐）

```dockerfile
# 去掉 --workers 参数
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8596"]
```

**优点：**
- 状态一致性
- 简单可靠
- 便于调试

**性能说明：**

```python
# FastAPI + uvicorn 单进程异步性能已经很强
# 可以处理数千个并发连接
async def handle_request():
    # 异步 I/O 不会阻塞，单进程足够强大
    pass
```

### 方案3：多容器扩展（最佳实践）

```yaml
# docker-compose.yml
version: '3.8'
services:
  app1:
    image: myapp
    ports: ["8596:8596"]

  app2:
    image: myapp
    ports: ["8597:8596"]

  app3:
    image: myapp
    ports: ["8598:8596"]

  nginx:
    image: nginx
    ports: ["80:80"]
    # 负载均衡配置
```

**nginx 配置：**

```nginx
upstream backend {
    server app1:8596;
    server app2:8596;
    server app3:8596;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
        # 会话粘性（可选）
        ip_hash;
    }
}
```

## 最佳实践建议

### 1. 开发阶段

```python
# main.py - 保留用于本地开发调试
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8596, workers=1)
```

### 2. 容器化部署

```dockerfile
# Dockerfile - 单进程启动
FROM python:3.10-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt

# 关键：单进程启动
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8596"]
```

### 3. 生产环境扩展

```bash
# 通过多容器实例提供并发能力
docker run -d -p 8596:8596 --name app1 myapp
docker run -d -p 8597:8596 --name app2 myapp
docker run -d -p 8598:8596 --name app3 myapp
```

## 性能对比测试

```bash
# 单进程异步 vs 多进程
# 测试工具：wrk

# 单进程容器
wrk -t4 -c100 -d30s http://localhost:8596/api/test
# 结果：QPS 5000+，延迟稳定

# 多进程容器（有状态问题）
wrk -t4 -c100 -d30s http://localhost:8596/api/test
# 结果：QPS 可能更高，但状态不一致导致业务错误
```

## 总结

**Docker 容器中的多进程部署要避免的误区：**

❌ **错误做法：**
```dockerfile
CMD ["uvicorn", "main:app", "--workers", "4"]  # 状态隔离问题
```

✅ **正确做法：**
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8596"]  # 单进程
```

**核心原则：**
1. **一个容器一个进程** - Docker 的设计哲学
2. **水平扩展而非垂直扩展** - 多容器而非多进程
3. **状态外部化** - 如果必须多进程，状态要存储在外部

**适用场景：**
- 中小型应用：单进程容器完全够用
- 大型应用：多容器 + 负载均衡 + 外部状态存储

记住：**简单的方案往往是最可靠的方案**。在容器环境中，单进程 + 多容器比容器内多进程更稳定、更易维护。

---

*本文基于实际项目踩坑经验总结，希望能帮助大家避免类似问题。*