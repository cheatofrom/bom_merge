from fastapi import FastAPI, UploadFile, File, Query, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from services.excel_import import import_excel_to_db, import_excel_to_db_async
from services.cache_service import cache_service
from db import get_connection, get_db_connection, get_async_db_connection, get_pool_status, perform_pool_health_check, get_async_pool_status, perform_async_pool_health_check
import psycopg2
import os
import traceback
import logging
from datetime import datetime
from project_notes import router as project_notes_router
from auth_fastapi import create_auth_routes, get_current_user
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

app = FastAPI()

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
from services.file_service import get_uploaded_files, get_uploaded_files_async, get_uploaded_file, get_uploaded_file_async, update_file_name, update_project_name, update_file_name_async, update_project_name_async
# 导入文件映射服务模块
from services.mapping_service import get_file_mappings, get_file_mappings_async, create_file_mapping, create_file_mapping_async, update_file_mapping, update_file_mapping_async, delete_file_mapping
# 导入分类服务模块
from services.category_service import (
    get_all_categories_async, get_category_by_id_async, create_category_async, 
    update_category_async, delete_category_async, assign_project_to_category_async, 
    get_projects_by_category_async
)

# 获取上传文件列表API
@app.get("/uploaded_files")
async def get_uploaded_files():
    """
    获取所有上传的文件信息（带缓存优化）
    """
    try:
        # 尝试从缓存获取上传文件列表
        cache_key = "uploaded_files:all"
        cached_files = cache_service.get(cache_key)
        if cached_files is not None:
            logger.debug("从缓存获取上传文件列表")
            return cached_files
        
        # 缓存未命中，查询数据库
        async with get_async_db_connection() as conn:
            rows = await conn.fetch("""
                SELECT file_unique_id, original_filename, project_name, 
                       file_size, upload_time, status, rows_imported, category_id
                FROM uploaded_files 
                ORDER BY upload_time DESC
            """)
        
        # 转换查询结果
        result = []
        for row in rows:
            file_dict = dict(row)
            # 转换时间戳为字符串
            if 'upload_time' in file_dict and file_dict['upload_time']:
                file_dict['upload_time'] = str(file_dict['upload_time'])
            result.append(file_dict)
        
        # 缓存上传文件列表（10分钟）
        cache_service.set(cache_key, result, expire=600)
        logger.debug(f"缓存上传文件列表，共{len(result)}个文件")
        
        return result
        
    except Exception as e:
        logger.error(f"获取上传文件列表时出错: {str(e)}")
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
from services.file_service import save_uploaded_file_info, save_uploaded_file_info_async

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
            
            # 保存失败信息到uploaded_files表
            try:
                logger.info(f"保存失败信息到uploaded_files表, 文件: {file.filename}, 分类ID: {category_id}")
                save_uploaded_file_info(
                    original_filename=file.filename,
                    file_size=file_size,
                    project_name=current_project_name,
                    file_unique_id=file_unique_id,
                    status="failed",
                    error_message=str(e),
                    category_id=category_id
                )
            except Exception as save_err:
                logger.error(f"保存文件信息失败: {save_err}")
                logger.error(f"详细错误信息: {traceback.format_exc()}")
                
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
        # 清除上传文件列表缓存
        cache_service.delete("uploaded_files:all")
        # 清除项目列表缓存
        cache_service.delete("projects:all")
        cache_service.delete("project_names:all")
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
        cached_projects = cache_service.get(cache_key)
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
        cache_service.set(cache_key, result, expire=600)
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
        cached_projects = cache_service.get(cache_key)
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
        cache_service.set(cache_key, result, expire=300)
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
        cached_names = cache_service.get(cache_key)
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
        cache_service.set(cache_key, result, expire=600)
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
        cached_parts = cache_service.get(cache_key)
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
        cache_service.set(cache_key, result, expire=300)
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

class MergeByFileIdsRequest(BaseModel):
    file_unique_ids: List[str]

@app.post("/merge_parts")
async def merge_parts(request: Request):
    """
    合并多个项目的零部件数据（带缓存优化）
    """
    try:
        data = await request.json()
        project_names = data.get('project_names', [])
        
        if not project_names:
            return JSONResponse(status_code=400, content={"error": "请提供项目名称列表"})
        
        # 生成缓存键（基于项目名称列表的排序结果）
        sorted_projects = sorted(project_names)
        cache_key = f"merge_parts:{'|'.join(sorted_projects)}"
        
        # 尝试从缓存获取合并结果
        cached_result = cache_service.get(cache_key)
        if cached_result is not None:
            logger.debug(f"从缓存获取项目合并结果: {sorted_projects}")
            return cached_result
        
        # 缓存未命中，执行合并逻辑
        async with get_async_db_connection() as conn:
            # 构建查询条件
            placeholders = ','.join([f'${i+1}' for i in range(len(project_names))])
            query = f"""
                SELECT * FROM parts_library 
                WHERE project_name IN ({placeholders})
                ORDER BY project_name, id
            """
            
            rows = await conn.fetch(query, *project_names)
        
        # 按项目分组并合并
        projects_data = {}
        for row in rows:
            project_name = row['project_name']
            if project_name not in projects_data:
                projects_data[project_name] = []
            
            part_dict = dict(row)
            # 转换 Decimal 类型为 float
            for key, value in part_dict.items():
                if hasattr(value, '__float__'):
                    part_dict[key] = float(value)
            projects_data[project_name].append(part_dict)
        
        # 构建扁平化的零部件列表
        all_parts = []
        for parts_list in projects_data.values():
            all_parts.extend(parts_list)
        
        # 缓存合并结果（15分钟，因为合并操作相对耗时）
        cache_service.set(cache_key, all_parts, expire=900)
        logger.debug(f"缓存项目合并结果: {sorted_projects}，共{len(all_parts)}个零部件")
        
        return all_parts
        
    except Exception as e:
        logger.error(f"合并项目时出错: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"合并项目时出错: {str(e)}"})

@app.post("/merge_parts_by_file_ids")
async def merge_parts_by_file_ids(request: Request):
    """
    根据文件ID合并零部件数据（带缓存优化）
    """
    try:
        data = await request.json()
        file_ids = data.get('file_ids', [])
        
        if not file_ids:
            return JSONResponse(status_code=400, content={"error": "请提供文件ID列表"})
        
        # 生成缓存键（基于文件ID列表的排序结果）
        sorted_file_ids = sorted(file_ids)
        cache_key = f"merge_parts_by_files:{'|'.join(sorted_file_ids)}"
        
        # 尝试从缓存获取合并结果
        cached_result = cache_service.get(cache_key)
        if cached_result is not None:
            logger.debug(f"从缓存获取文件合并结果: {sorted_file_ids}")
            return cached_result
        
        # 缓存未命中，执行合并逻辑
        async with get_async_db_connection() as conn:
            # 构建查询条件
            placeholders = ','.join([f'${i+1}' for i in range(len(file_ids))])
            query = f"""
                SELECT * FROM parts_library 
                WHERE file_unique_id IN ({placeholders})
                ORDER BY file_unique_id, id
            """
            
            rows = await conn.fetch(query, *file_ids)
        
        # 按文件ID分组并合并
        files_data = {}
        for row in rows:
            file_id = row['file_unique_id']
            if file_id not in files_data:
                files_data[file_id] = []
            
            part_dict = dict(row)
            # 转换 Decimal 类型为 float
            for key, value in part_dict.items():
                if hasattr(value, '__float__'):
                    part_dict[key] = float(value)
            files_data[file_id].append(part_dict)
        
        # 构建扁平化的零部件列表
        all_parts = []
        for parts_list in files_data.values():
            all_parts.extend(parts_list)
        
        # 缓存合并结果（15分钟）
        cache_service.set(cache_key, all_parts, expire=900)
        logger.debug(f"缓存文件合并结果: {sorted_file_ids}，共{len(all_parts)}个零部件")
        
        return all_parts
        
    except Exception as e:
        logger.error(f"按文件ID合并时出错: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"按文件ID合并时出错: {str(e)}"})



@app.post("/update_parts")
def update_parts(req: UpdatePartsRequest):
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            
            updated_count = 0
            
            for part in req.parts:
                # 构建更新语句
                update_fields = []
                update_values = []
                
                # 动态构建更新字段和值
                for field, value in part.dict(exclude={'id'}).items():
                    if value is not None:  # 只更新非空字段
                        update_fields.append(f"{field} = %s")
                        update_values.append(value)
                
                if not update_fields:  # 如果没有要更新的字段，跳过
                    continue
                    
                # 添加ID作为WHERE条件的值
                update_values.append(part.id)
                
                # 构建并执行SQL语句
                sql = f"""
                    UPDATE parts_library 
                    SET {', '.join(update_fields)}
                    WHERE id = %s
                """
                cur.execute(sql, update_values)
                updated_count += cur.rowcount
            
            conn.commit()
            cur.close()
        
        return {"status": "success", "updated_count": updated_count}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"更新零部件失败: {str(e)}"})


# 保存合并项目API
@app.post("/save_merged_project")
def save_merged_project(req: SaveMergedProjectRequest, current_user_data = Depends(get_current_user)):
    """保存合并项目（带连接管理优化和用户权限）"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        
        with get_db_connection() as conn:
            cur = conn.cursor()
            try:
                # 插入合并项目记录，包含创建者信息
                if req.source_file_ids:
                    cur.execute("""
                        INSERT INTO merged_projects (merged_project_name, source_projects, source_file_ids, created_by, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (req.merged_project_name, req.source_projects, req.source_file_ids, user_id, datetime.now(), datetime.now()))
                else:
                    cur.execute("""
                        INSERT INTO merged_projects (merged_project_name, source_projects, created_by, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s)
                        RETURNING id
                    """, (req.merged_project_name, req.source_projects, user_id, datetime.now(), datetime.now()))
                
                merged_project_id = cur.fetchone()[0]
                
                # 插入合并零部件记录
                for part in req.parts:
                    cur.execute("""
                        INSERT INTO merged_parts (
                            merged_project_id, level, part_code, part_name, spec, version, material,
                            unit_count_per_level, unit_weight_kg, total_weight_kg, part_property,
                            drawing_size, reference_number, purchase_status, process_route, remark,
                            created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        merged_project_id, part.get('level'), part.get('part_code'), part.get('part_name'),
                        part.get('spec'), part.get('version'), part.get('material'),
                        part.get('unit_count_per_level'), part.get('unit_weight_kg'), part.get('total_weight_kg'),
                        part.get('part_property'), part.get('drawing_size'), part.get('reference_number'),
                        part.get('purchase_status'), part.get('process_route'), part.get('remark'),
                        datetime.now(), datetime.now()
                    ))
                
                conn.commit()
                return {"status": "success", "merged_project_id": merged_project_id, "message": "合并项目保存成功"}
            finally:
                cur.close()
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"保存合并项目失败: {str(e)}"})

# 保存合并项目API - 带连字符的路由（新增）
@app.post("/save-merged-project")
def save_merged_project_with_hyphen(req: SaveMergedProjectRequest, current_user_data = Depends(get_current_user)):
    return save_merged_project(req, current_user_data)

# 获取所有合并项目API - 带连字符的路由（新增）
@app.get("/merged-projects")
def get_merged_projects_with_hyphen(current_user_data = Depends(get_current_user)):
    return get_merged_projects(current_user_data)

# 获取合并项目API
@app.get("/merged_projects")
def get_merged_projects(current_user_data = Depends(get_current_user)):
    """获取合并项目列表（带用户权限过滤）"""
    try:
        user_info, token = current_user_data
        user_id = user_info['id']
        user_role = user_info['role']
        
        conn = get_connection()
        cur = conn.cursor()
        
        # 管理员可以看到所有项目，普通用户只能看到自己创建的项目
        if user_role == 'admin':
            cur.execute("""
                SELECT mp.id, mp.merged_project_name, mp.source_projects, mp.created_at, mp.created_by,
                       u.username as creator_name, u.full_name as creator_full_name
                FROM merged_projects mp
                LEFT JOIN users u ON mp.created_by = u.id
                ORDER BY mp.created_at DESC
            """)
        else:
            cur.execute("""
                SELECT mp.id, mp.merged_project_name, mp.source_projects, mp.created_at, mp.created_by,
                       u.username as creator_name, u.full_name as creator_full_name
                FROM merged_projects mp
                LEFT JOIN users u ON mp.created_by = u.id
                WHERE mp.created_by = %s
                ORDER BY mp.created_at DESC
            """, (user_id,))
        
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        result = []
        for row in rows:
            result.append({
                "id": row[0],
                "merged_project_name": row[1],
                "source_projects": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
                "created_by": row[4],
                "creator_name": row[5],
                "creator_full_name": row[6]
            })
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"获取合并项目时出错: {str(e)}"})

# 获取合并项目的零部件API - 带连字符的路由（新增）
@app.get("/merged-project-parts/{merged_project_id}")
def get_merged_project_parts_with_hyphen(merged_project_id: int):
    return get_merged_project_parts(merged_project_id)

# 获取合并项目的零部件API（带连接管理优化）
@app.get("/merged_project_parts/{merged_project_id}")
def get_merged_project_parts(merged_project_id: int):
    try:
        conn = get_connection()
        cur = None
        try:
            cur = conn.cursor()
            
            # 首先获取合并项目信息
            cur.execute("""
                SELECT id, merged_project_name, source_projects, created_at
                FROM merged_projects
                WHERE id = %s
            """, (merged_project_id,))
            
            project_row = cur.fetchone()
            if not project_row:
                return JSONResponse(status_code=404, content={"error": "合并项目不存在"})
                
            project = {
                "id": project_row[0],
                "merged_project_name": project_row[1],
                "source_projects": project_row[2],
                "created_at": project_row[3].isoformat() if project_row[3] else None
            }
            
            # 然后获取合并项目的零部件
            cur.execute("""
                SELECT * FROM merged_parts
                WHERE merged_project_id = %s
                ORDER BY id
            """, (merged_project_id,))
            
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
        finally:
            if cur:
                cur.close()
        conn.close()
        
        # 转换为字典列表
        parts = []
        for row in rows:
            part_dict = dict(zip(columns, row))
            # 确保level字段是整数类型
            if 'level' in part_dict and part_dict['level'] is not None:
                try:
                    part_dict['level'] = int(part_dict['level'])
                except (ValueError, TypeError):
                    part_dict['level'] = 0
            else:
                part_dict['level'] = 0
                
            # 格式化日期时间字段
            for date_field in ['created_at', 'updated_at']:
                if date_field in part_dict and part_dict[date_field]:
                    part_dict[date_field] = part_dict[date_field].isoformat()
                    
            parts.append(part_dict)
        
        #parts.append(part_dict)
        
        return {"parts": parts, "project": project}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"获取合并项目零部件时出错: {str(e)}"})

# 删除合并项目API - 带连字符的路由（新增）
@app.delete("/merged-projects/{merged_project_id}")
def delete_merged_project_with_hyphen(merged_project_id: int):
    return delete_merged_project(merged_project_id)

# 删除合并项目中的零部件API - 带连字符的路由（新增）
@app.delete("/merged-parts/{part_id}")
def delete_merged_part_with_hyphen(part_id: int):
    return delete_merged_part(part_id)

# 删除合并项目API
@app.delete("/merged_projects/{merged_project_id}")
def delete_merged_project(merged_project_id: int):
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # 首先删除合并项目的所有零部件
        cur.execute("""
            DELETE FROM merged_parts
            WHERE merged_project_id = %s
        """, (merged_project_id,))
        
        # 然后删除合并项目
        cur.execute("""
            DELETE FROM merged_projects
            WHERE id = %s
        """, (merged_project_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return {"status": "success", "message": "合并项目删除成功"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"删除合并项目失败: {str(e)}"})

# 删除合并项目中的零部件API
@app.delete("/merged_parts/{part_id}")
def delete_merged_part(part_id: int):
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # 删除指定的零部件
        cur.execute("""
            DELETE FROM merged_parts
            WHERE id = %s
        """, (part_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return {"status": "success", "message": "零部件删除成功"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"删除零部件失败: {str(e)}"})

# 导出合并项目为Excel API - 带连字符的路由（新增）
@app.get("/export-merged-project/{merged_project_id}")
def export_merged_project_with_hyphen(merged_project_id: int):
    return export_merged_project(merged_project_id)

@app.get("/export_merged_project/{merged_project_id}")
def export_merged_project(merged_project_id: int):
    try:
        import pandas as pd
        from io import BytesIO
        from fastapi.responses import StreamingResponse
        import traceback
        print(f"开始导出合并项目 ID: {merged_project_id}")
        print(f"导入pandas版本: {pd.__version__}")
        print(f"导入BytesIO和StreamingResponse成功")
        
        conn = get_connection()
        cur = conn.cursor()
        
        # 获取合并项目信息
        cur.execute("""
            SELECT merged_project_name FROM merged_projects
            WHERE id = %s
        """, (merged_project_id,))
        
        project_row = cur.fetchone()
        if not project_row:
            return JSONResponse(status_code=404, content={"error": "合并项目不存在"})
            
        project_name = project_row[0]
        
        # 获取合并项目的零部件
        cur.execute("""
            SELECT 
                level, part_code, part_name, spec, version, material,
                unit_count_per_level, unit_weight_kg, total_weight_kg, part_property,
                drawing_size, reference_number, purchase_status, process_route, remark
            FROM merged_parts
            WHERE merged_project_id = %s
            ORDER BY id
        """, (merged_project_id,))
        
        rows = cur.fetchall()
        columns = ['层级', '零件号', '零件名称', '规格', '版本号', '材料',
                  '单层级用量', '单件重量(kg)', '总成重量(kg)', '零件属性',
                  '图幅', '参图号', '采购状态', '工艺路线', '备注']
        
        cur.close()
        conn.close()
        
        # 创建DataFrame
        df = pd.DataFrame(rows, columns=columns)
        
        # 创建Excel文件
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='合并零部件')
        
        output.seek(0)
        
        # 返回Excel文件
        # 使用英文文件名避免编码问题
        ascii_filename = f"merged_project_{merged_project_id}.xlsx"
        
        # 创建响应
        response = StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={ascii_filename}"}
        )
        
        return response
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"导出合并项目时出错: {str(e)}")
        print(f"错误堆栈: {error_traceback}")
        return JSONResponse(status_code=500, content={"error": f"导出合并项目时出错: {str(e)}"})

# 删除普通项目API（带连接管理优化）
@app.delete("/projects/{project_name}")
def delete_project(project_name: str):
    try:
        conn = get_connection()
        cur = None
        try:
            cur = conn.cursor()
            
            # 删除指定项目的所有零部件
            cur.execute("""
                DELETE FROM parts_library
                WHERE project_name = %s
            """, (project_name,))
            
            # 删除项目备注
            cur.execute("""
                DELETE FROM project_notes
                WHERE project_name = %s
            """, (project_name,))
            
            conn.commit()
            
            # 清理相关缓存
            try:
                # 清理项目列表相关缓存
                cache_service.delete("projects:all")
                cache_service.delete("project_names:all")
                logger.info("已清理项目列表缓存")
                
                # 清理零部件相关缓存
                cache_service.delete(f"parts:{project_name}")
                cache_service.delete("parts:all")
                logger.info(f"已清理项目 {project_name} 的零部件缓存")
                
                # 清理用户权限相关缓存
                cache_keys_to_delete = [
                    "user_projects:*",
                    "user_categories:*",
                    "user_permissions:*"
                ]
                for pattern in cache_keys_to_delete:
                    deleted_count = cache_service.clear_pattern(pattern)
                    logger.info(f"已清理模式 {pattern} 的缓存，删除了 {deleted_count} 个键")
                logger.info("已清理用户权限相关缓存")
                
            except Exception as cache_error:
                logger.warning(f"清理缓存时出错: {str(cache_error)}")
                # 缓存清理失败不影响删除操作的成功
            
            return {"status": "success", "message": "项目删除成功"}
        finally:
            if cur:
                cur.close()
        conn.close()
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"删除项目失败: {str(e)}"})

# 基于文件ID删除项目API
@app.delete("/uploaded_files/{file_unique_id}")
def delete_project_by_file_id(file_unique_id: str):
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            
            # 首先获取项目名称和分类ID用于删除备注和清理缓存
            cur.execute("""
                SELECT project_name, category_id FROM uploaded_files
                WHERE file_unique_id = %s
            """, (file_unique_id,))
            
            result = cur.fetchone()
            if not result:
                return JSONResponse(status_code=404, content={"status": "error", "message": "文件不存在"})
            
            project_name = result[0]
            category_id = result[1]
            
            # 删除parts_library表中对应文件ID的所有记录
            cur.execute("""
                DELETE FROM parts_library
                WHERE file_unique_id = %s
            """, (file_unique_id,))
            
            # 删除uploaded_files表中的记录
            cur.execute("""
                DELETE FROM uploaded_files
                WHERE file_unique_id = %s
            """, (file_unique_id,))
            
            # 删除project_notes表中的记录
            cur.execute("""
                DELETE FROM project_notes
                WHERE project_name = %s
            """, (project_name,))
            
            conn.commit()
            
        # 清理相关缓存
        try:
            # 清理上传文件列表缓存
            cache_service.delete("uploaded_files:all")
            logger.info("已清理上传文件列表缓存")
            
            # 清理项目列表相关缓存
            cache_service.delete("projects:all")
            cache_service.delete("project_names:all")
            logger.info("已清理项目列表缓存")
            
            # 清理零部件相关缓存
            cache_service.delete(f"parts:{project_name}")
            cache_service.delete("parts:all")
            logger.info(f"已清理项目 {project_name} 的零部件缓存")
            
            # 如果项目有分类，清理分类相关缓存
            if category_id:
                cache_service.delete(f"projects_by_category:{category_id}")
                logger.info(f"已清理分类 {category_id} 的项目缓存")
            
            # 清理用户权限相关缓存（使用通配符模式）
            cache_keys_to_delete = [
                "user_projects:*",
                "user_categories:*",
                "user_permissions:*"
            ]
            for pattern in cache_keys_to_delete:
                deleted_count = cache_service.clear_pattern(pattern)
                logger.info(f"已清理模式 {pattern} 的缓存，删除了 {deleted_count} 个键")
            logger.info("已清理用户权限相关缓存")
            
        except Exception as cache_error:
            logger.warning(f"清理缓存时出错: {str(cache_error)}")
            # 缓存清理失败不影响删除操作的成功
            
        return {"status": "success", "message": "项目删除成功"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"删除项目失败: {str(e)}"})

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
        cached_categories = cache_service.get(cache_key)
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
        cache_service.set(cache_key, categories, expire=300)
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
                cache_keys = cache_service.redis_client.keys("user_categories:*")
                if cache_keys:
                    cache_service.redis_client.delete(*cache_keys)
                    logger.info(f"清理了 {len(cache_keys)} 个用户分类缓存")
            else:
                # 内存缓存清理
                keys_to_delete = [key for key in cache_service._memory_cache.keys() if key.startswith("user_categories:")]
                for key in keys_to_delete:
                    del cache_service._memory_cache[key]
                logger.info(f"清理了 {len(keys_to_delete)} 个内存分类缓存")
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
                cache_keys = cache_service.redis_client.keys("user_categories:*")
                if cache_keys:
                    cache_service.redis_client.delete(*cache_keys)
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
                cache_keys = cache_service.redis_client.keys("user_categories:*")
                if cache_keys:
                    cache_service.redis_client.delete(*cache_keys)
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
        # 检查同步连接池
        sync_status = get_pool_status()
        sync_health = perform_pool_health_check()
        
        # 检查异步连接池
        async_status = await get_async_pool_status()
        async_health = await perform_async_pool_health_check()
        
        overall_health = sync_health and async_health
        
        return {
            "status": "healthy" if overall_health else "unhealthy",
            "sync_pool": {
                "status": sync_status,
                "health_check": sync_health
            },
            "async_pool": {
                "status": async_status,
                "health_check": async_health
            },
            "timestamp": sync_status.get("timestamp")
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

@app.get("/api/health/db-pool/sync")
def check_sync_db_pool_health():
    """检查同步数据库连接池健康状态"""
    try:
        status = get_pool_status()
        health = perform_pool_health_check()
        
        return {
            "status": "healthy" if health else "unhealthy",
            "pool_info": status,
            "health_check": health
        }
    except Exception as e:
        logger.error(f"同步连接池健康检查失败: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": str(e)
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
    # 使用多个工作进程提高并发能力，生产环境建议设置为CPU核心数
    uvicorn.run("main:app", host="0.0.0.0", port=8596, workers=4)
