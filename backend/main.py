from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Query, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from services.excel_import import  import_excel_to_db_async
from services.cache_service import cache_service
from db import get_async_db_connection, get_async_pool_status, perform_async_pool_health_check
import os
import traceback
import logging
from datetime import datetime
from project_notes import router as project_notes_router
from auth_fastapi import create_auth_routes, get_current_user, get_admin_user
from permission_fastapi import create_permission_routes

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("upload_api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("upload_api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理器"""
    # 启动时初始化缓存服务
    try:
        await cache_service.initialize()
        logger.info("缓存服务初始化成功")
    except Exception as e:
        logger.error(f"缓存服务初始化失败: {e}")
        # 即使缓存初始化失败，应用也应该继续运行，只是使用内存缓存
        logger.info("应用将继续运行，使用内存缓存作为备选方案")
    
    yield  # 应用运行期间
    
    # 关闭时清理资源
    try:
        await cache_service.close()
        logger.info("缓存服务已关闭")
    except Exception as e:
        logger.error(f"关闭缓存服务时出错: {e}")

app = FastAPI(lifespan=lifespan)

# 添加CORS中间件，允许跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，生产环境中应该限制为特定域名
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有HTTP方法
    allow_headers=["*"],  # 允许所有HTTP头
)

# 添加项目备注路由
app.include_router(project_notes_router, tags=["project_notes"])

# 添加认证路由
create_auth_routes(app)

# 添加权限管理路由
create_permission_routes(app)

# 导入文件服务模块
from services.file_service import get_uploaded_file_async, update_file_name_async, update_project_name_async, save_uploaded_file_info_async
# 导入文件映射服务模块
from services.mapping_service import get_file_mappings_async
# 导入分类服务模块
from services.category_service import (
    get_all_categories_async, get_category_by_id_async, create_category_async, 
    update_category_async, delete_category_async, assign_project_to_category_async, 
    get_projects_by_category_async
)

# 获取上传文件列表API
@app.get("/uploaded_files")
async def get_uploaded_files(current_user_data = Depends(get_current_user)):
    """
    获取用户有权限的上传文件信息（带缓存优化）
    """
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        logger.info(f"用户 {user_id} (角色: {user_role}) 请求上传文件列表")
        
        # 构建缓存键，包含用户ID和角色
        cache_key = f"uploaded_files:{user_id}:{user_role}"
        cached_files = await cache_service.get(cache_key)
        if cached_files is not None:
            logger.debug(f"从缓存获取用户{user_id}的上传文件列表")
            return cached_files
        
        # 缓存未命中，查询数据库
        async with get_async_db_connection() as conn:
            if user_role == 'admin':
                # 管理员可以看到所有文件
                rows = await conn.fetch("""
                    SELECT file_unique_id, original_filename, project_name, 
                           file_size, upload_time, status, rows_imported, category_id
                    FROM uploaded_files 
                    ORDER BY upload_time DESC
                """)
                logger.info(f"管理员查询结果: 找到 {len(rows)} 个上传文件")
            else:
                # 普通用户只能看到有权限的分类下的文件
                rows = await conn.fetch("""
                    SELECT uf.file_unique_id, uf.original_filename, uf.project_name, 
                           uf.file_size, uf.upload_time, uf.status, uf.rows_imported, uf.category_id
                    FROM uploaded_files uf
                    JOIN user_category_permissions ucp ON uf.category_id = ucp.category_id
                    WHERE ucp.user_id = $1 AND ucp.permission_type IN ('view', 'edit')
                    ORDER BY uf.upload_time DESC
                """, user_id)
                logger.info(f"普通用户查询结果: 找到 {len(rows)} 个有权限的上传文件")
        
        # 转换查询结果
        result = []
        for row in rows:
            file_dict = dict(row)
            # 转换时间戳为字符串
            if 'upload_time' in file_dict and file_dict['upload_time']:
                file_dict['upload_time'] = str(file_dict['upload_time'])
            result.append(file_dict)
        
        # 缓存上传文件列表（5分钟，因为权限可能变化较频繁）
        await cache_service.set(cache_key, result, expire=300)
        logger.debug(f"缓存用户{user_id}的上传文件列表，共{len(result)}个文件")
        
        return result
        
    except HTTPException as http_exc:
        logger.error(f"HTTP异常: {http_exc.status_code} - {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"获取上传文件列表时出错: {str(e)}")
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"error": f"获取上传文件列表时出错: {str(e)}"})


# 获取单个上传文件信息API
@app.get("/uploaded_files/{file_unique_id}")
async def get_single_uploaded_file(file_unique_id: str):
    try:
        file_info = await get_uploaded_file_async(file_unique_id)
        if not file_info:
            return JSONResponse(status_code=404, content={"error": f"未找到文件ID为 {file_unique_id} 的文件"})
        return file_info
    except Exception as e:
        error_detail = f"获取文件信息失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取文件信息失败: {str(e)}"})

# 删除上传文件API - 管理员权限
@app.delete("/uploaded_files/{file_unique_id}")
async def delete_uploaded_file(file_unique_id: str, current_user_data = Depends(get_admin_user)):
    """
    删除上传的文件（管理员功能）
    会删除uploaded_files记录和相关的parts_library数据
    """
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        logger.info(f"[DELETE] 管理员用户 {user_id} (角色: {user_role}) 请求删除文件 {file_unique_id}")
        logger.info(f"[DELETE] 请求时间: {datetime.now().isoformat()}")
        logger.info(f"[DELETE] 文件唯一ID: {file_unique_id}")
        
        async with get_async_db_connection() as conn:
            # 首先检查文件是否存在
            logger.info(f"[DELETE] 开始查询文件信息，文件ID: {file_unique_id}")
            file_info = await conn.fetchrow("""
                SELECT id, original_filename, project_name, category_id
                FROM uploaded_files 
                WHERE file_unique_id = $1
            """, file_unique_id)
            
            if not file_info:
                logger.warning(f"[DELETE] 文件未找到，文件ID: {file_unique_id}")
                return JSONResponse(status_code=404, content={"error": f"未找到文件ID为 {file_unique_id} 的文件"})
            
            original_filename = file_info['original_filename']
            project_name = file_info['project_name']
            category_id = file_info['category_id']
            logger.info(f"[DELETE] 文件信息查询成功: {original_filename} (项目: {project_name}, 分类ID: {category_id})")
            
            # 删除相关的parts_library数据
            logger.info(f"[DELETE] 开始删除parts_library数据，文件ID: {file_unique_id}")
            deleted_parts = await conn.execute("""
                DELETE FROM parts_library 
                WHERE file_unique_id = $1
            """, file_unique_id)
            logger.info(f"[DELETE] parts_library数据删除完成")
            
            # 删除uploaded_files记录
            logger.info(f"[DELETE] 开始删除uploaded_files记录，文件ID: {file_unique_id}")
            deleted_files = await conn.execute("""
                DELETE FROM uploaded_files 
                WHERE file_unique_id = $1
            """, file_unique_id)
            logger.info(f"[DELETE] uploaded_files记录删除完成")
            
            # 清理相关缓存
            try:
                # 清理文件列表缓存
                if cache_service.redis_client:
                    cache_keys = await cache_service.redis_client.keys("uploaded_files:*")
                    if cache_keys:
                        await cache_service.redis_client.delete(*cache_keys)
                        logger.info(f"清理了 {len(cache_keys)} 个上传文件缓存")
                else:
                    # 内存缓存清理
                    keys_to_delete = [key for key in cache_service._memory_cache.keys() 
                                    if key.startswith("uploaded_files:")]
                    for key in keys_to_delete:
                        del cache_service._memory_cache[key]
                    logger.info(f"清理了 {len(keys_to_delete)} 个内存上传文件缓存")
            except Exception as cache_error:
                logger.warning(f"清理缓存失败: {cache_error}")
            
            logger.info(f"文件删除成功: {file_unique_id} - {original_filename} (项目: {project_name})")
            return {"status": "success", "message": f"文件 {original_filename} 删除成功"}
            
    except HTTPException as http_exc:
        logger.error(f"HTTP异常: {http_exc.status_code} - {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"删除文件失败: {str(e)}")
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"error": f"删除文件失败: {str(e)}"})

# 更新文件名API
@app.put("/uploaded_files/{file_unique_id}/rename")
async def rename_uploaded_file(file_unique_id: str, new_filename: str = Query(..., description="新的文件名")):
    try:
        # 首先检查文件是否存在
        file_info = await get_uploaded_file_async(file_unique_id)
        if not file_info:
            return JSONResponse(status_code=404, content={"error": f"未找到文件ID为 {file_unique_id} 的文件"})
        
        # 更新文件名
        success = await update_file_name_async(file_unique_id, new_filename)
        
        if success:
            # 获取更新后的文件信息
            updated_file_info = await get_uploaded_file_async(file_unique_id)
            return {"status": "success", "message": "文件名更新成功", "file": updated_file_info}
        else:
            return JSONResponse(status_code=500, content={"error": "文件名更新失败"})
    except Exception as e:
        error_detail = f"更新文件名失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"更新文件名失败: {str(e)}"})

# 更新项目名称API
@app.put("/uploaded_files/{file_unique_id}/update_project")
async def update_uploaded_file_project(file_unique_id: str, new_project_name: str = Query(..., description="新的项目名称")):
    try:
        # 首先检查文件是否存在
        file_info = await get_uploaded_file_async(file_unique_id)
        if not file_info:
            return JSONResponse(status_code=404, content={"error": f"未找到文件ID为 {file_unique_id} 的文件"})
        
        # 更新项目名称
        success = await update_project_name_async(file_unique_id, new_project_name)
        
        if success:
            # 获取更新后的文件信息
            updated_file_info = await get_uploaded_file_async(file_unique_id)
            return {"status": "success", "message": "项目名称更新成功", "file": updated_file_info}
        else:
            return JSONResponse(status_code=500, content={"error": "项目名称更新失败"})
    except Exception as e:
        error_detail = f"更新项目名称失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"更新项目名称失败: {str(e)}"})

# 获取文件映射API
@app.get("/file_mappings")
async def get_all_file_mappings(
    file_unique_id: str = Query(default=None),
    entity_type: str = Query(default=None),
    entity_id: str = Query(default=None)
):
    try:
        mappings = await get_file_mappings_async(file_unique_id, entity_type, entity_id)
        return mappings
    except Exception as e:
        error_detail = f"获取文件映射失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取文件映射失败: {str(e)}"})

# 获取指定文件的映射API
@app.get("/file_mappings/{file_unique_id}")
async def get_file_mappings_by_id(file_unique_id: str):
    try:
        mappings = await get_file_mappings_async(file_unique_id)
        return mappings
    except Exception as e:
        error_detail = f"获取文件映射失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取文件映射失败: {str(e)}"})


import uuid

@app.post("/upload_parts_excel")
async def upload_parts_excel(
    request: Request,
    files: list[UploadFile] = File(...),
    project_name: str = Query(default=None)
):
    total_count = 0
    results = []
    
    # 从FormData中获取category_id
    form_data = await request.form()
    category_id = form_data.get('category_id')
    if category_id:
        try:
            category_id = int(category_id)
        except (ValueError, TypeError):
            category_id = None
    
    # 添加日志记录接收到的参数
    logger.info(f"上传文件请求 - 项目名: {project_name}, 分类ID: {category_id}, 文件数量: {len(files)}")
    
    for file in files:
        # 如果 project_name 为空，则用文件名（去扩展名）作为默认值
        current_project_name = project_name
        if not current_project_name:
            filename = file.filename  # 例如 s500.xlsx
            current_project_name = os.path.splitext(filename)[0]  # 结果 s500

        # 为每个文件生成唯一ID
        file_unique_id = str(uuid.uuid4())
        logger.info(f"生成文件唯一ID: {file_unique_id}")
        
        # 使用唯一ID作为上传批次的一部分
        upload_batch = f"batch_{current_project_name}_{file_unique_id[:8]}"
        
        # 获取文件大小
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        file.file.seek(0)  # 重置文件指针到开始位置
        
        logger.info(f"开始处理上传文件: {file.filename}, 大小: {file_size} 字节, 项目名称: {current_project_name}, 文件ID: {file_unique_id}, 分类ID: {category_id}")
        
        try:
            # 导入Excel数据到零件库
            logger.info(f"调用import_excel_to_db_async异步导入Excel数据, 文件: {file.filename}")
            count = await import_excel_to_db_async(file.file, upload_batch, current_project_name, file_unique_id)
            
            # 保存文件信息到uploaded_files表
            logger.info(f"导入成功，保存文件信息到uploaded_files表, 文件: {file.filename}, 导入行数: {count}, 分类ID: {category_id}")
            await save_uploaded_file_info_async(
                original_filename=file.filename,
                file_size=file_size,
                project_name=current_project_name,
                file_unique_id=file_unique_id,
                status="imported",
                rows_imported=count,
                category_id=category_id
            )
            logger.info(f"文件信息保存成功: {file.filename}, 分类ID已设置为: {category_id}")
            
            total_count += count
            results.append({
                "filename": file.filename,
                "project_name": current_project_name,
                "file_id": file_unique_id,
                "status": "imported",
                "rows_imported": count
            })
        except Exception as e:
            error_detail = f"导入错误: {str(e)}\n详细信息: {traceback.format_exc()}"
            logger.error(f"文件 {file.filename} 导入失败: {str(e)}")
            logger.error(f"详细错误信息: {traceback.format_exc()}")
            
            # 记录客户端信息
            client_host = getattr(request, 'client', None)
            if client_host:
                logger.error(f"客户端信息: {client_host.host}:{client_host.port}")
            
            # 不再保存失败记录到uploaded_files表，避免出现"空壳"记录
            logger.info(f"导入失败，不保存记录到uploaded_files表，文件: {file.filename}")
                
            results.append({
                "filename": file.filename,
                "project_name": current_project_name,
                "file_id": file_unique_id,
                "status": "failed",
                "error": str(e),
                "detail": error_detail
            })
    
    # 如果有文件上传成功，清除相关缓存
    if any(result["status"] == "imported" for result in results):
        # 清除所有上传文件列表缓存（包括用户特定的缓存）
        await cache_service.clear_pattern("uploaded_files:*")
        # 清除项目列表缓存
        await cache_service.delete("projects:all")
        await cache_service.delete("project_names:all")
        # 清除用户项目缓存
        await cache_service.clear_pattern("user_projects:*")
        logger.info("文件上传成功，已清除相关缓存")
    
    if all(result["status"] == "imported" for result in results):
        return {"status": "success", "rows_imported": total_count, "details": results}
    elif any(result["status"] == "imported" for result in results):
        return {"status": "partial_success", "rows_imported": total_count, "details": results}
    else:
        return JSONResponse(status_code=500, content={"status": "error", "details": results})


@app.get("/projects")
async def get_all_projects():
    try:
        # 尝试从缓存获取项目列表
        cache_key = "projects:all"
        cached_projects = await cache_service.get(cache_key)
        if cached_projects is not None:
            logger.debug("从缓存获取项目列表")
            return cached_projects
        
        # 缓存未命中，查询数据库
        async with get_async_db_connection() as conn:
            rows = await conn.fetch("""
                SELECT DISTINCT project_name, upload_batch, file_unique_id, created_at
                FROM parts_library
                ORDER BY created_at DESC
            """)
        
        result = [{"project_name": row['project_name'], "upload_batch": row['upload_batch'], "file_unique_id": row['file_unique_id']} for row in rows]
        
        # 缓存项目列表（10分钟）
        await cache_service.set(cache_key, result, expire=600)
        logger.debug("缓存项目列表")
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"查询项目时出错: {str(e)}"})

@app.get("/user-projects")
async def get_user_projects(current_user_data = Depends(get_current_user)):
    """
    获取当前用户有权限的项目列表（带缓存优化）
    """
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info.get('role', 'user')
        
        logger.info(f"用户 {user_id} (角色: {user_role}) 请求获取项目列表")
        
        # 尝试从缓存获取用户项目列表
        cache_key = f"user_projects:{user_id}"
        cached_projects = await cache_service.get(cache_key)
        if cached_projects is not None:
            logger.debug(f"从缓存获取用户{user_id}的项目列表")
            return cached_projects
        
        # 缓存未命中，查询数据库
        logger.info(f"缓存未命中，开始查询数据库 - 用户ID: {user_id}, 角色: {user_role}")
        
        async with get_async_db_connection() as conn:
            if user_role == 'admin':
                # 管理员可以看到所有项目
                logger.info("管理员用户，查询所有项目")
                rows = await conn.fetch("""
                    SELECT DISTINCT project_name, upload_batch, file_unique_id, created_at
                    FROM parts_library
                    ORDER BY created_at DESC
                """)
                logger.info(f"管理员查询结果: 找到 {len(rows)} 个项目")
            else:
                # 普通用户只能看到有权限的项目（通过分类权限）
                logger.info(f"普通用户，查询有权限的项目 - 用户ID: {user_id}")
                
                # 先检查用户是否有任何分类权限
                permission_rows = await conn.fetch("""
                    SELECT category_id, permission_type FROM user_category_permissions 
                    WHERE user_id = $1
                """, user_id)
                logger.info(f"用户 {user_id} 的分类权限: {[(row['category_id'], row['permission_type']) for row in permission_rows]}")
                
                # 检查uploaded_files表中的category_id分布
                category_stats = await conn.fetch("""
                    SELECT category_id, COUNT(*) as file_count 
                    FROM uploaded_files 
                    WHERE category_id IS NOT NULL 
                    GROUP BY category_id
                """)
                logger.info(f"uploaded_files表中的分类统计: {[(row['category_id'], row['file_count']) for row in category_stats]}")
                
                rows = await conn.fetch("""
                    SELECT DISTINCT pl.project_name, pl.upload_batch, pl.file_unique_id, pl.created_at
                    FROM parts_library pl
                    JOIN uploaded_files uf ON pl.file_unique_id = uf.file_unique_id
                    JOIN user_category_permissions ucp ON uf.category_id = ucp.category_id
                    WHERE ucp.user_id = $1 AND ucp.permission_type IN ('view', 'edit')
                    ORDER BY pl.created_at DESC
                """, user_id)
                logger.info(f"普通用户查询结果: 找到 {len(rows)} 个有权限的项目")
        
        result = [{"project_name": row['project_name'], "upload_batch": row['upload_batch'], "file_unique_id": row['file_unique_id']} for row in rows]
        
        # 缓存用户项目列表（5分钟，因为权限可能变化较频繁）
        await cache_service.set(cache_key, result, expire=300)
        logger.debug(f"缓存用户{user_id}的项目列表")
        
        logger.info(f"成功返回用户 {user_id} 的项目列表，共 {len(result)} 个项目")
        return result
    except Exception as e:
        error_detail = f"查询用户项目时出错: {str(e)}\n详细信息: {traceback.format_exc()}"
        logger.error(error_detail)
        return JSONResponse(status_code=500, content={"error": f"查询用户项目时出错: {str(e)}"})

@app.get("/project_names")
async def get_project_names():
    """
    获取所有不同的项目名称（带缓存优化）
    """
    try:
        # 尝试从缓存获取项目名称列表
        cache_key = "project_names:all"
        cached_names = await cache_service.get(cache_key)
        if cached_names is not None:
            logger.debug("从缓存获取项目名称列表")
            return cached_names
        
        # 缓存未命中，查询数据库
        async with get_async_db_connection() as conn:
            rows = await conn.fetch("""
                SELECT DISTINCT project_name
                FROM parts_library
                ORDER BY project_name
            """)
        
        result = [row['project_name'] for row in rows]
        
        # 缓存项目名称列表（10分钟）
        await cache_service.set(cache_key, result, expire=600)
        logger.debug("缓存项目名称列表")
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"查询项目名称时出错: {str(e)}"})
@app.get("/parts")
async def get_parts(project_name: str = Query(..., description="项目名称")):
    """
    获取指定项目的零部件列表（带缓存优化）
    """
    try:
        # 尝试从缓存获取零部件数据
        cache_key = f"parts:{project_name}"
        cached_parts = await cache_service.get(cache_key)
        if cached_parts is not None:
            logger.debug(f"从缓存获取项目{project_name}的零部件列表")
            return cached_parts
        
        # 缓存未命中，查询数据库
        async with get_async_db_connection() as conn:
            rows = await conn.fetch("""
                SELECT * FROM parts_library 
                WHERE project_name = $1 
                ORDER BY id
            """, project_name)
        
        # 转换查询结果
        result = []
        for row in rows:
            part_dict = dict(row)
            # 转换 Decimal 类型为 float
            for key, value in part_dict.items():
                if hasattr(value, '__float__'):
                    part_dict[key] = float(value)
            result.append(part_dict)
        
        # 缓存零部件数据（5分钟）
        await cache_service.set(cache_key, result, expire=300)
        logger.debug(f"缓存项目{project_name}的零部件列表，共{len(result)}条记录")
        
        return result
    except Exception as e:
        logger.error(f"获取零部件数据时出错: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"获取零部件数据时出错: {str(e)}"})


# 添加合并多个项目的零部件API
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class MergeRequest(BaseModel):
    project_names: List[str]

class MergeByFileIdsRequest(BaseModel):
    file_ids: List[str]
    
class SaveMergedProjectRequest(BaseModel):
    merged_project_name: str
    source_projects: List[str]
    source_file_ids: Optional[List[str]] = None
    parts: List[dict]

class PartUpdate(BaseModel):
    id: int
    level: Optional[int] = None
    part_code: Optional[str] = None
    part_name: Optional[str] = None
    spec: Optional[str] = None
    version: Optional[str] = None
    material: Optional[str] = None
    unit_count_per_level: Optional[str] = None
    unit_weight_kg: Optional[str] = None
    total_weight_kg: Optional[float] = None
    part_property: Optional[str] = None
    drawing_size: Optional[str] = None
    reference_number: Optional[str] = None
    purchase_status: Optional[str] = None
    process_route: Optional[str] = None
    remark: Optional[str] = None

class UpdatePartsRequest(BaseModel):
    parts: List[PartUpdate]


# 合并多个项目的零部件API（通过项目名称）
@app.post("/merge_parts")
async def merge_parts(req: MergeRequest):
    """合并多个项目的零部件"""
    try:
        async with get_async_db_connection() as conn:
            # 获取所有项目的零部件
            all_parts = []
            for project_name in req.project_names:
                rows = await conn.fetch("""
                    SELECT * FROM parts_library 
                    WHERE project_name = $1 
                    ORDER BY id
                """, project_name)
                
                for row in rows:
                    part_dict = dict(row)
                    # 转换 Decimal 类型为 float
                    for key, value in part_dict.items():
                        if hasattr(value, '__float__'):
                            part_dict[key] = float(value)
                    all_parts.append(part_dict)
            
            return all_parts
    except Exception as e:
        logger.error(f"合并零部件时出错: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"合并零部件时出错: {str(e)}"})


# 合并多个项目的零部件API（通过文件唯一ID）
@app.post("/merge_parts_by_file_ids")
async def merge_parts_by_file_ids(req: MergeByFileIdsRequest):
    """合并多个文件项目的零部件"""
    try:
        async with get_async_db_connection() as conn:
            # 获取所有文件的零部件
            all_parts = []
            for file_unique_id in req.file_ids:
                rows = await conn.fetch("""
                    SELECT * FROM parts_library 
                    WHERE file_unique_id = $1 
                    ORDER BY id
                """, file_unique_id)
                
                for row in rows:
                    part_dict = dict(row)
                    # 转换 Decimal 类型为 float
                    for key, value in part_dict.items():
                        if hasattr(value, '__float__'):
                            part_dict[key] = float(value)
                    all_parts.append(part_dict)
            
            return all_parts
    except Exception as e:
        logger.error(f"合并文件零部件时出错: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"合并文件零部件时出错: {str(e)}"})

# 更新零部件API（异步实现）
@app.post("/update_parts")
async def update_parts(req: UpdatePartsRequest):
    try:
        async with get_async_db_connection() as conn:
            updated_count = 0
            
            for part in req.parts:
                # 构建更新语句
                update_fields = []
                update_values = []
                
                # 动态构建更新字段和值
                for field, value in part.dict(exclude={'id'}).items():
                    if value is not None:  # 只更新非空字段
                        update_fields.append(f"{field} = ${len(update_values) + 1}")
                        update_values.append(value)
                
                if not update_fields:  # 如果没有要更新的字段，跳过
                    continue
                    
                # 添加ID作为WHERE条件的值
                update_values.append(part.id)
                
                # 构建并执行SQL语句
                sql = f"""
                    UPDATE parts_library 
                    SET {', '.join(update_fields)}
                    WHERE id = ${len(update_values)}
                """
                rowcount = await conn.execute(sql, *update_values)
                updated_count += int(rowcount.split()[-1])  # 提取影响的行数
            
            return {"status": "success", "updated_count": updated_count}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"更新零部件失败: {str(e)}"})


# 保存合并项目API（异步实现）
@app.post("/save_merged_project")
async def save_merged_project(req: SaveMergedProjectRequest, current_user_data = Depends(get_current_user)):
    """保存合并项目（带连接管理优化和用户权限）"""
    try:
        # 添加调试日志
        logger.info(f"收到保存合并项目请求: merged_project_name={req.merged_project_name}, source_projects={req.source_projects}, parts_count={len(req.parts)}")
        
        user_info, token = current_user_data
        user_id = user_info['id']
        
        async with get_async_db_connection() as conn:
            # 插入合并项目记录，包含创建者信息
            if req.source_file_ids:
                merged_project_id = await conn.fetchval("""
                    INSERT INTO merged_projects (merged_project_name, source_projects, source_file_ids, created_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $5)
                    RETURNING id
                """, req.merged_project_name, req.source_projects, req.source_file_ids, user_id, datetime.now())
            else:
                merged_project_id = await conn.fetchval("""
                    INSERT INTO merged_projects (merged_project_name, source_projects, created_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $4)
                    RETURNING id
                """, req.merged_project_name, req.source_projects, user_id, datetime.now())
            
            # 批量插入合并零部件记录
            if req.parts:
                values_list = []
                for part in req.parts:
                    values_list.append((
                        merged_project_id, part.get('level'), part.get('part_code'), part.get('part_name'),
                        part.get('spec'), part.get('version'), part.get('material'),
                        part.get('unit_count_per_level'), part.get('unit_weight_kg'), part.get('total_weight_kg'),
                        part.get('part_property'), part.get('drawing_size'), part.get('reference_number'),
                        part.get('purchase_status'), part.get('process_route'), part.get('remark'),
                        datetime.now(), datetime.now()
                    ))
                
                await conn.executemany("""
                    INSERT INTO merged_parts (
                        merged_project_id, level, part_code, part_name, spec, version, material,
                        unit_count_per_level, unit_weight_kg, total_weight_kg, part_property,
                        drawing_size, reference_number, purchase_status, process_route, remark,
                        created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                """, values_list)
            
            return {"status": "success", "merged_project_id": merged_project_id, "message": "合并项目保存成功"}
        
    except Exception as e:
        logger.error(f"保存合并项目失败: {str(e)}")
        logger.error(f"请求数据: merged_project_name={req.merged_project_name}, source_projects={req.source_projects}")
        return JSONResponse(status_code=500, content={"status": "error", "message": f"保存合并项目失败: {str(e)}"})

# 保存合并项目API - 带连字符的路由（新增）
@app.post("/save-merged-project")
async def save_merged_project_with_hyphen(req: SaveMergedProjectRequest, current_user_data = Depends(get_current_user)):
    return await save_merged_project(req, current_user_data)

# 获取所有合并项目API - 带连字符的路由（新增）
@app.get("/merged-projects")
async def get_merged_projects_with_hyphen(current_user_data = Depends(get_current_user)):
    return await get_merged_projects(current_user_data)

# 获取合并项目API
# 获取合并项目列表API（异步实现）
@app.get("/merged_projects")
async def get_merged_projects(current_user_data = Depends(get_current_user)):
    """获取合并项目列表（带用户权限过滤）"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        async with get_async_db_connection() as conn:
            # 管理员可以看到所有项目，普通用户只能看到自己创建的项目
            if user_role == 'admin':
                rows = await conn.fetch("""
                    SELECT mp.id, mp.merged_project_name, mp.source_projects, mp.created_at, mp.created_by,
                           u.username as creator_name, u.full_name as creator_full_name
                    FROM merged_projects mp
                    LEFT JOIN users u ON mp.created_by = u.id
                    ORDER BY mp.created_at DESC
                """)
            else:
                rows = await conn.fetch("""
                    SELECT mp.id, mp.merged_project_name, mp.source_projects, mp.created_at, mp.created_by,
                           u.username as creator_name, u.full_name as creator_full_name
                    FROM merged_projects mp
                    LEFT JOIN users u ON mp.created_by = u.id
                    WHERE mp.created_by = $1
                    ORDER BY mp.created_at DESC
                """, user_id)
        
        result = []
        for row in rows:
            result.append({
                "id": row['id'],
                "merged_project_name": row['merged_project_name'],
                "source_projects": row['source_projects'],
                "created_at": row['created_at'].isoformat() if row['created_at'] else None,
                "created_by": row['created_by'],
                "creator_name": row['creator_name'],
                "creator_full_name": row['creator_full_name']
            })
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"获取合并项目时出错: {str(e)}"})

# 获取合并项目的零部件API - 带连字符的路由（新增）
@app.get("/merged-project-parts/{merged_project_id}")
async def get_merged_project_parts_with_hyphen(merged_project_id: int, current_user_data = Depends(get_current_user)):
    return await get_merged_project_parts(merged_project_id, current_user_data)

# 获取合并项目的零部件API（带连接管理优化）
@app.get("/merged_project_parts/{merged_project_id}")
async def get_merged_project_parts(merged_project_id: int, current_user_data = Depends(get_current_user)):
    """获取指定合并项目的所有部件"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        async with get_async_db_connection() as conn:
            # 首先检查项目是否存在，以及用户是否有权限访问
            if user_role == 'admin':
                project_check = await conn.fetchrow("""
                    SELECT mp.id, mp.merged_project_name, mp.created_by
                    FROM merged_projects mp
                    WHERE mp.id = $1
                """, merged_project_id)
            else:
                project_check = await conn.fetchrow("""
                    SELECT mp.id, mp.merged_project_name, mp.created_by
                    FROM merged_projects mp
                    WHERE mp.id = $1 AND mp.created_by = $2
                """, merged_project_id, user_id)
            
            if not project_check:
                return JSONResponse(status_code=404, content={"error": "合并项目未找到或无权限访问"})
            
            # 获取项目部件
            rows = await conn.fetch("""
                SELECT mp.id, mp.part_number, mp.part_name, mp.specification, mp.quantity, 
                       mp.unit, mp.manufacturer, mp.material, mp.remarks, mp.file_id, mp.project_name
                FROM merged_parts mp
                WHERE mp.merged_project_id = $1
                ORDER BY mp.part_number
            """, merged_project_id)
        
        result = []
        for row in rows:
            result.append({
                "id": row['id'],
                "part_number": row['part_number'],
                "part_name": row['part_name'],
                "specification": row['specification'],
                "quantity": row['quantity'],
                "unit": row['unit'],
                "manufacturer": row['manufacturer'],
                "material": row['material'],
                "remarks": row['remarks'],
                "file_id": row['file_id'],
                "project_name": row['project_name']
            })
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"获取合并项目部件时出错: {str(e)}"})

# 删除合并项目API - 带连字符的路由（新增）
@app.delete("/merged-projects/{merged_project_id}")
async def delete_merged_project_with_hyphen(merged_project_id: int, current_user_data = Depends(get_current_user)):
    return await delete_merged_project(merged_project_id, current_user_data)

# 删除合并项目中的零部件API - 带连字符的路由（新增）
@app.delete("/merged-parts/{part_id}")
async def delete_merged_part_with_hyphen(part_id: int, current_user_data = Depends(get_current_user)):
    return await delete_merged_part(part_id, current_user_data)

# 删除合并项目API（异步实现）
@app.delete("/merged_projects/{merged_project_id}")
async def delete_merged_project(merged_project_id: int, current_user_data = Depends(get_current_user)):
    """删除合并项目及其所有部件"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        logger.info(f"收到删除合并项目请求: merged_project_id={merged_project_id}, user_id={user_id}, user_role={user_role}")
        
        async with get_async_db_connection() as conn:
            # 首先检查项目是否存在，以及用户是否有权限删除
            if user_role == 'admin':
                project_check = await conn.fetchrow("""
                    SELECT mp.id, mp.created_by
                    FROM merged_projects mp
                    WHERE mp.id = $1
                """, merged_project_id)
                logger.info(f"管理员删除检查: merged_project_id={merged_project_id}, project_check={project_check}")
            else:
                project_check = await conn.fetchrow("""
                    SELECT mp.id, mp.created_by
                    FROM merged_projects mp
                    WHERE mp.id = $1 AND mp.created_by = $2
                """, merged_project_id, user_id)
                logger.info(f"普通用户删除检查: merged_project_id={merged_project_id}, user_id={user_id}, project_check={project_check}")
            
            if not project_check:
                logger.warning(f"合并项目未找到或无权限删除: merged_project_id={merged_project_id}, user_id={user_id}")
                return JSONResponse(status_code=404, content={"error": "合并项目未找到或无权限删除"})
            
            # 开始事务
            async with conn.transaction():
                logger.info(f"开始删除合并项目的所有部件: merged_project_id={merged_project_id}")
                # 先删除合并项目的所有部件
                parts_result = await conn.execute("""
                    DELETE FROM merged_parts
                    WHERE merged_project_id = $1
                """, merged_project_id)
                logger.info(f"删除部件结果: {parts_result}")
                
                logger.info(f"开始删除合并项目: merged_project_id={merged_project_id}")
                # 然后删除合并项目
                result = await conn.execute("""
                    DELETE FROM merged_projects
                    WHERE id = $1
                """, merged_project_id)
                
                logger.info(f"删除项目结果: {result}")
                if result == "DELETE 0":
                    return JSONResponse(status_code=404, content={"error": "合并项目删除失败"})
        
        # 清除相关缓存
        logger.info(f"清除相关缓存: merged_project_id={merged_project_id}")
        await cache_service.clear_pattern("merged_projects:*")
        await cache_service.clear_pattern(f"merged_project_parts:{merged_project_id}:*")
        
        logger.info(f"合并项目删除成功: merged_project_id={merged_project_id}")
        return {"status": "success", "message": "合并项目及其部件删除成功"}
    except Exception as e:
        logger.error(f"删除合并项目时出错: merged_project_id={merged_project_id}, error={str(e)}")
        logger.error(f"错误详情: {type(e).__name__}: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"删除合并项目时出错: {str(e)}"})

# 删除合并项目中的零部件API
# 删除合并项目中的部件API（异步实现）
@app.delete("/merged_parts/{part_id}")
async def delete_merged_part(part_id: int, current_user_data = Depends(get_current_user)):
    """删除合并项目中的指定部件"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        async with get_async_db_connection() as conn:
            # 首先检查部件是否存在，以及用户是否有权限删除
            if user_role == 'admin':
                part_check = await conn.fetchrow("""
                    SELECT mp.id, mp.merged_project_id, mp.part_number, mp.project_name
                    FROM merged_parts mp
                    JOIN merged_projects mpr ON mp.merged_project_id = mpr.id
                    WHERE mp.id = $1
                """, part_id)
            else:
                part_check = await conn.fetchrow("""
                    SELECT mp.id, mp.merged_project_id, mp.part_number, mp.project_name
                    FROM merged_parts mp
                    JOIN merged_projects mpr ON mp.merged_project_id = mpr.id
                    WHERE mp.id = $1 AND mpr.created_by = $2
                """, part_id, user_id)
            
            if not part_check:
                return JSONResponse(status_code=404, content={"error": "部件未找到或无权限删除"})
            
            # 删除部件
            result = await conn.execute("""
                DELETE FROM merged_parts
                WHERE id = $1
            """, part_id)
            
            if result == "DELETE 0":
                return JSONResponse(status_code=404, content={"error": "部件删除失败"})
        
        # 清除相关缓存
        await cache_service.clear_pattern("merged_project_parts:*")
        
        return {"status": "success", "message": f"部件 {part_check['part_number']} 删除成功"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"删除部件时出错: {str(e)}"})

# 导出合并项目为Excel API - 带连字符的路由（新增）
@app.get("/export-merged-project/{merged_project_id}")
def export_merged_project_with_hyphen(merged_project_id: int):
    return export_merged_project(merged_project_id)

# 导出合并项目为Excel API（异步实现）
@app.get("/export_merged_project/{merged_project_id}")
async def export_merged_project(merged_project_id: int, current_user_data = Depends(get_current_user)):
    """导出合并项目为Excel文件"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        async with get_async_db_connection() as conn:
            # 首先检查项目是否存在，以及用户是否有权限访问
            if user_role == 'admin':
                project_check = await conn.fetchrow("""
                    SELECT mp.id, mp.merged_project_name, mp.source_projects, mp.created_at
                    FROM merged_projects mp
                    WHERE mp.id = $1
                """, merged_project_id)
            else:
                project_check = await conn.fetchrow("""
                    SELECT mp.id, mp.merged_project_name, mp.source_projects, mp.created_at
                    FROM merged_projects mp
                    WHERE mp.id = $1 AND mp.created_by = $2
                """, merged_project_id, user_id)
            
            if not project_check:
                return JSONResponse(status_code=404, content={"error": "合并项目未找到或无权限访问"})
            
            # 获取项目部件
            rows = await conn.fetch("""
                SELECT mp.part_number, mp.part_name, mp.specification, mp.quantity, 
                       mp.unit, mp.manufacturer, mp.material, mp.remarks, mp.project_name
                FROM merged_parts mp
                WHERE mp.merged_project_id = $1
                ORDER BY mp.part_number
            """, merged_project_id)
        
        # 创建Excel文件
        df = pd.DataFrame([{
            "物料编码": row['part_number'],
            "物料名称": row['part_name'],
            "规格": row['specification'],
            "数量": row['quantity'],
            "单位": row['unit'],
            "制造商": row['manufacturer'],
            "材质": row['material'],
            "备注": row['remarks'],
            "所属项目": row['project_name']
        } for row in rows])
        
        # 创建内存中的Excel文件
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='物料清单', index=False)
            
            # 获取工作表并设置列宽
            worksheet = writer.sheets['物料清单']
            for column in worksheet.columns:
                max_length = 0
                column_letter = column[0].column_letter
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                worksheet.column_dimensions[column_letter].width = adjusted_width
        
        output.seek(0)
        
        # 返回文件
        filename = f"{project_check['merged_project_name']}_物料清单.xlsx"
        return StreamingResponse(
            io.BytesIO(output.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"导出合并项目时出错: {str(e)}"})

# 删除普通项目API（带连接管理优化）
@app.delete("/projects/{project_name}")
async def delete_project(project_name: str, current_user_data = Depends(get_current_user)):
    """删除项目及其所有相关数据"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        async with get_async_db_connection() as conn:
            # 首先检查项目是否存在，以及用户是否有权限删除
            if user_role == 'admin':
                project_check = await conn.fetchrow("""
                    SELECT DISTINCT project_name, file_id
                    FROM parts_library
                    WHERE project_name = $1
                    LIMIT 1
                """, project_name)
            else:
                project_check = await conn.fetchrow("""
                    SELECT DISTINCT pl.project_name, pl.file_id
                    FROM parts_library pl
                    JOIN uploaded_files uf ON pl.file_unique_id = uf.file_unique_id
                    WHERE pl.project_name = $1 AND uf.uploaded_by = $2
                    LIMIT 1
                """, project_name, user_id)
            
            if not project_check:
                return JSONResponse(status_code=404, content={"error": "项目未找到或无权限删除"})
            
            # 开始事务
            async with conn.transaction():
                # 删除项目部件
                await conn.execute("""
                    DELETE FROM parts_library
                    WHERE project_name = $1
                """, project_name)
                
                # 删除项目相关笔记
                await conn.execute("""
                    DELETE FROM project_notes
                    WHERE project_name = $1
                """, project_name)
                
                # 删除上传文件记录
                await conn.execute("""
                    DELETE FROM uploaded_files
                    WHERE project_name = $1
                """, project_name)
        
        # 清除相关缓存
        await cache_service.clear_pattern("projects:*")
        await cache_service.clear_pattern("parts:*")
        await cache_service.clear_pattern("file_mappings:*")
        await cache_service.clear_pattern("uploaded_files:*")
        
        return {"status": "success", "message": f"项目 '{project_name}' 及其所有相关数据删除成功"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"删除项目时出错: {str(e)}"})

# 基于文件ID删除项目API（异步实现）
@app.delete("/uploaded_files/{file_unique_id}")
async def delete_project_by_file_id(file_unique_id: str, current_user_data = Depends(get_current_user)):
    """基于文件ID删除项目及其所有相关数据"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        # 管理员可以直接删除任何文件
        if user_role != 'admin':
            return JSONResponse(status_code=403, content={"error": "无权限删除此文件"})
        
        async with get_async_db_connection() as conn:
            # 首先获取项目名称和分类ID用于删除备注和清理缓存
            file_info = await conn.fetchrow("""
                SELECT project_name, category_id
                FROM uploaded_files
                WHERE file_unique_id = $1
            """, file_unique_id)
            
            if not file_info:
                return JSONResponse(status_code=404, content={"error": "文件不存在"})
            
            project_name = file_info['project_name']
            category_id = file_info['category_id']
            
            # 开始事务
            async with conn.transaction():
                # 删除parts_library表中对应文件ID的所有记录
                await conn.execute("""
                    DELETE FROM parts_library
                    WHERE file_unique_id = $1
                """, file_unique_id)
                
                # 删除uploaded_files表中的记录
                await conn.execute("""
                    DELETE FROM uploaded_files
                    WHERE file_unique_id = $1
                """, file_unique_id)
                
                # 删除project_notes表中的记录
                await conn.execute("""
                    DELETE FROM project_notes
                    WHERE project_name = $1
                """, project_name)
        
        # 清理相关缓存
        await cache_service.clear_pattern("uploaded_files:*")
        await cache_service.clear_pattern("projects:*")
        await cache_service.clear_pattern("parts:*")
        await cache_service.clear_pattern("file_mappings:*")
        
        # 如果有分类，清理分类相关缓存
        if category_id:
            await cache_service.clear_pattern(f"projects_by_category:{category_id}")
        
        return {"status": "success", "message": "项目删除成功"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"删除项目时出错: {str(e)}"})

# ==================== 分类管理API ====================

# 获取所有分类
@app.get("/categories")
async def get_categories():
    try:
        categories = await get_all_categories_async()
        return categories
    except Exception as e:
        error_detail = f"获取分类列表失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        logger.error(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取分类列表失败: {str(e)}"})

# 获取用户有权限的分类
@app.get("/user-categories")
async def get_user_categories(current_user_data = Depends(get_current_user)):
    """获取用户有权限的分类列表（带缓存优化）"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        # 构建缓存键
        cache_key = f"user_categories:{user_id}:{user_role}"
        
        # 尝试从缓存获取分类列表
        cached_categories = await cache_service.get(cache_key)
        if cached_categories is not None:
            logger.debug(f"从缓存获取用户{user_id}的分类列表")
            return cached_categories
        
        # 缓存未命中，查询数据库
        # 如果是管理员，返回所有分类
        if user_role == 'admin':
            categories = await get_all_categories_async()
        else:
            # 普通用户只返回有权限的分类
            async with get_async_db_connection() as conn:
                # 获取用户有权限的分类
                rows = await conn.fetch("""
                    SELECT DISTINCT c.id, c.name, c.description, c.color, c.created_at, c.updated_at
                    FROM categories c
                    INNER JOIN user_category_permissions ucp ON c.id = ucp.category_id
                    WHERE ucp.user_id = $1
                    ORDER BY c.created_at ASC
                """, user_id)
                
                categories = []
                for row in rows:
                    categories.append({
                        'id': row['id'],
                        'name': row['name'],
                        'description': row['description'],
                        'color': row['color'],
                        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
                    })
        
        # 缓存分类列表（5分钟，因为权限可能变化较频繁）
        await cache_service.set(cache_key, categories, expire=300)
        logger.debug(f"缓存用户{user_id}的分类列表，共{len(categories)}个分类")
        
        return categories
            
    except Exception as e:
        logger.error(f"获取用户分类时出错: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"查询用户分类时出错: {str(e)}"})

# 根据ID获取分类
@app.get("/categories/{category_id}")
async def get_category(category_id: int):
    try:
        category = await get_category_by_id_async(category_id)
        if not category:
            return JSONResponse(status_code=404, content={"error": f"未找到ID为 {category_id} 的分类"})
        return category
    except Exception as e:
        error_detail = f"获取分类失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        logger.error(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取分类失败: {str(e)}"})

# 创建新分类
@app.post("/categories")
async def create_category(request: Request):
    try:
        # 从请求体获取JSON数据
        data = await request.json()
        name = data.get('name')
        description = data.get('description')
        color = data.get('color', '#3B82F6')
        
        if not name:
            return JSONResponse(status_code=400, content={"error": "分类名称不能为空"})
            
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": "请求数据格式错误"})
    
    try:
        category = await create_category_async(name, description, color)
        
        # 清理分类相关缓存
        try:
            # 清理所有用户的分类缓存
            if cache_service.redis_client:
                # 获取所有用户分类缓存键
                cache_keys = await cache_service.redis_client.keys("user_categories:*")
                if cache_keys:
                    await cache_service.redis_client.delete(*cache_keys)
                    logger.info(f"清理了 {len(cache_keys)} 个用户分类缓存")
                
                # 清理该分类相关的权限缓存
                permission_cache_keys = await cache_service.redis_client.keys(f"permission:*:category:{category_id}:*")
                if permission_cache_keys:
                    await cache_service.redis_client.delete(*permission_cache_keys)
                    logger.info(f"清理了 {len(permission_cache_keys)} 个分类 {category_id} 的权限缓存")
            else:
                # 内存缓存清理
                keys_to_delete = [key for key in cache_service._memory_cache.keys() if key.startswith("user_categories:")]
                for key in keys_to_delete:
                    del cache_service._memory_cache[key]
                logger.info(f"清理了 {len(keys_to_delete)} 个内存分类缓存")
                
                # 清理权限缓存
                permission_keys_to_delete = [key for key in cache_service._memory_cache.keys() 
                                           if key.startswith("permission:") and f":category:{category_id}:" in key]
                for key in permission_keys_to_delete:
                    del cache_service._memory_cache[key]
                logger.info(f"清理了 {len(permission_keys_to_delete)} 个内存权限缓存")
        except Exception as cache_error:
            logger.warning(f"清理分类缓存失败: {cache_error}")
        
        return {"status": "success", "message": "分类创建成功", "category": category}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        error_detail = f"创建分类失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        logger.error(error_detail)
        return JSONResponse(status_code=500, content={"error": f"创建分类失败: {str(e)}"})

# 更新分类
@app.put("/categories/{category_id}")
async def update_category(
    category_id: int,
    name: str = Query(default=None, description="分类名称"),
    description: str = Query(default=None, description="分类描述"),
    color: str = Query(default=None, description="分类颜色")
):
    try:
        category = await update_category_async(category_id, name, description, color)
        if not category:
            return JSONResponse(status_code=404, content={"error": f"未找到ID为 {category_id} 的分类"})
        
        # 清理分类相关缓存
        try:
            # 清理所有用户的分类缓存
            if cache_service.redis_client:
                # 获取所有用户分类缓存键
                cache_keys = await cache_service.redis_client.keys("user_categories:*")
                if cache_keys:
                    await cache_service.redis_client.delete(*cache_keys)
                    logger.info(f"清理了 {len(cache_keys)} 个用户分类缓存")
            else:
                # 内存缓存清理
                keys_to_delete = [key for key in cache_service._memory_cache.keys() if key.startswith("user_categories:")]
                for key in keys_to_delete:
                    del cache_service._memory_cache[key]
                logger.info(f"清理了 {len(keys_to_delete)} 个内存分类缓存")
        except Exception as cache_error:
            logger.warning(f"清理分类缓存失败: {cache_error}")
        
        return {"status": "success", "message": "分类更新成功", "category": category}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        error_detail = f"更新分类失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        logger.error(error_detail)
        return JSONResponse(status_code=500, content={"error": f"更新分类失败: {str(e)}"})

# 删除分类
@app.delete("/categories/{category_id}")
async def delete_category(category_id: int):
    try:
        success = await delete_category_async(category_id)
        if not success:
            return JSONResponse(status_code=404, content={"error": f"未找到ID为 {category_id} 的分类"})
        
        # 清理分类相关缓存
        try:
            # 清理所有用户的分类缓存
            if cache_service.redis_client:
                # 获取所有用户分类缓存键
                cache_keys = await cache_service.redis_client.keys("user_categories:*")
                if cache_keys:
                    await cache_service.redis_client.delete(*cache_keys)
                    logger.info(f"清理了 {len(cache_keys)} 个用户分类缓存")
            else:
                # 内存缓存清理
                keys_to_delete = [key for key in cache_service._memory_cache.keys() if key.startswith("user_categories:")]
                for key in keys_to_delete:
                    del cache_service._memory_cache[key]
                logger.info(f"清理了 {len(keys_to_delete)} 个内存分类缓存")
        except Exception as cache_error:
            logger.warning(f"清理分类缓存失败: {cache_error}")
        
        return {"status": "success", "message": "分类删除成功"}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        error_detail = f"删除分类失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        logger.error(error_detail)
        return JSONResponse(status_code=500, content={"error": f"删除分类失败: {str(e)}"})

# 将项目分配到分类
@app.post("/projects/{project_name}/category")
async def assign_project_category(
    project_name: str,
    file_unique_id: str = Query(..., description="文件唯一ID"),
    category_id: int = Query(..., description="分类ID")
):
    try:
        result = await assign_project_to_category_async(project_name, file_unique_id, category_id)
        return {"status": "success", "message": "项目分类分配成功", "assignment": result}
    except Exception as e:
        error_detail = f"分配项目分类失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        logger.error(error_detail)
        return JSONResponse(status_code=500, content={"error": f"分配项目分类失败: {str(e)}"})

# 获取指定分类下的所有项目
@app.get("/categories/{category_id}/projects")
async def get_category_projects(category_id: int):
    try:
        projects = await get_projects_by_category_async(category_id)
        return projects
    except Exception as e:
        error_detail = f"获取分类项目失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        logger.error(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取分类项目失败: {str(e)}"})

# 连接池健康检查和监控API
@app.get("/api/health/db-pool")
async def check_db_pool_health():
    """检查数据库连接池健康状态"""
    try:
        # 检查异步连接池
        async_status = await get_async_pool_status()
        async_health = await perform_async_pool_health_check()
        
        return {
            "status": "healthy" if async_health else "unhealthy",
            "async_pool": {
                "status": async_status,
                "health_check": async_health
            },
            "timestamp": async_status.get("timestamp")
        }
    except Exception as e:
        logger.error(f"连接池健康检查失败: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": str(e),
                "timestamp": time.time()
            }
        )

@app.get("/api/health/db-pool/async")
async def check_async_db_pool_health():
    """检查异步数据库连接池健康状态"""
    try:
        status = await get_async_pool_status()
        health = await perform_async_pool_health_check()
        
        return {
            "status": "healthy" if health else "unhealthy",
            "pool_info": status,
            "health_check": health
        }
    except Exception as e:
        logger.error(f"异步连接池健康检查失败: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": str(e)
            }
        )

if __name__ == "__main__":
    import uvicorn
    import time
    # Docker环境中使用单进程，通过容器编排实现多实例
    uvicorn.run("main:app", host="0.0.0.0", port=8596)
