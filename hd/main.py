from fastapi import FastAPI, UploadFile, File, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from services.excel_import import import_excel_to_db
from db import get_connection
import psycopg2
import os
import traceback
from project_notes import router as project_notes_router

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

# 导入文件服务模块
from services.file_service import get_uploaded_files, get_uploaded_file, update_file_name, update_project_name
# 导入文件映射服务模块
from services.mapping_service import get_file_mappings, create_file_mapping, update_file_mapping, delete_file_mapping

# 获取上传文件列表API
@app.get("/uploaded_files")
def get_all_uploaded_files(project_name: str = Query(default=None)):
    try:
        files = get_uploaded_files(project_name)
        return files
    except Exception as e:
        error_detail = f"获取上传文件列表失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取上传文件列表失败: {str(e)}"})

# 获取单个上传文件信息API
@app.get("/uploaded_files/{file_unique_id}")
def get_single_uploaded_file(file_unique_id: str):
    try:
        file_info = get_uploaded_file(file_unique_id)
        if not file_info:
            return JSONResponse(status_code=404, content={"error": f"未找到文件ID为 {file_unique_id} 的文件"})
        return file_info
    except Exception as e:
        error_detail = f"获取文件信息失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取文件信息失败: {str(e)}"})

# 更新文件名API
@app.put("/uploaded_files/{file_unique_id}/rename")
def rename_uploaded_file(file_unique_id: str, new_filename: str = Query(..., description="新的文件名")):
    try:
        # 首先检查文件是否存在
        file_info = get_uploaded_file(file_unique_id)
        if not file_info:
            return JSONResponse(status_code=404, content={"error": f"未找到文件ID为 {file_unique_id} 的文件"})
        
        # 更新文件名
        success = update_file_name(file_unique_id, new_filename)
        
        if success:
            # 获取更新后的文件信息
            updated_file_info = get_uploaded_file(file_unique_id)
            return {"status": "success", "message": "文件名更新成功", "file": updated_file_info}
        else:
            return JSONResponse(status_code=500, content={"error": "文件名更新失败"})
    except Exception as e:
        error_detail = f"更新文件名失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"更新文件名失败: {str(e)}"})

# 更新项目名称API
@app.put("/uploaded_files/{file_unique_id}/update_project")
def update_uploaded_file_project(file_unique_id: str, new_project_name: str = Query(..., description="新的项目名称")):
    try:
        # 首先检查文件是否存在
        file_info = get_uploaded_file(file_unique_id)
        if not file_info:
            return JSONResponse(status_code=404, content={"error": f"未找到文件ID为 {file_unique_id} 的文件"})
        
        # 更新项目名称
        success = update_project_name(file_unique_id, new_project_name)
        
        if success:
            # 获取更新后的文件信息
            updated_file_info = get_uploaded_file(file_unique_id)
            return {"status": "success", "message": "项目名称更新成功", "file": updated_file_info}
        else:
            return JSONResponse(status_code=500, content={"error": "项目名称更新失败"})
    except Exception as e:
        error_detail = f"更新项目名称失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"更新项目名称失败: {str(e)}"})

# 获取文件映射API
@app.get("/file_mappings")
def get_all_file_mappings(
    file_unique_id: str = Query(default=None),
    entity_type: str = Query(default=None),
    entity_id: str = Query(default=None)
):
    try:
        mappings = get_file_mappings(file_unique_id, entity_type, entity_id)
        return mappings
    except Exception as e:
        error_detail = f"获取文件映射失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取文件映射失败: {str(e)}"})

# 获取指定文件的映射API
@app.get("/file_mappings/{file_unique_id}")
def get_file_mappings_by_id(file_unique_id: str):
    try:
        mappings = get_file_mappings(file_unique_id)
        return mappings
    except Exception as e:
        error_detail = f"获取文件映射失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        return JSONResponse(status_code=500, content={"error": f"获取文件映射失败: {str(e)}"})


import uuid
from services.file_service import save_uploaded_file_info

@app.post("/upload_parts_excel")
async def upload_parts_excel(
    files: list[UploadFile] = File(...),
    project_name: str = Query(default=None)
):
    total_count = 0
    results = []
    
    for file in files:
        # 如果 project_name 为空，则用文件名（去扩展名）作为默认值
        current_project_name = project_name
        if not current_project_name:
            filename = file.filename  # 例如 s500.xlsx
            current_project_name = os.path.splitext(filename)[0]  # 结果 s500

        # 为每个文件生成唯一ID
        file_unique_id = str(uuid.uuid4())
        
        # 使用唯一ID作为上传批次的一部分
        upload_batch = f"batch_{current_project_name}_{file_unique_id[:8]}"
        
        # 获取文件大小
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        file.file.seek(0)  # 重置文件指针到开始位置
        
        try:
            # 导入Excel数据到零件库
            count = import_excel_to_db(file.file, upload_batch, current_project_name, file_unique_id)
            
            # 保存文件信息到uploaded_files表
            save_uploaded_file_info(
                original_filename=file.filename,
                file_size=file_size,
                project_name=current_project_name,
                file_unique_id=file_unique_id,
                status="imported",
                rows_imported=count
            )
            
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
            
            # 保存失败信息到uploaded_files表
            try:
                save_uploaded_file_info(
                    original_filename=file.filename,
                    file_size=file_size,
                    project_name=current_project_name,
                    file_unique_id=file_unique_id,
                    status="failed",
                    error_message=str(e)
                )
            except Exception as save_err:
                print(f"保存文件信息失败: {save_err}")
                
            results.append({
                "filename": file.filename,
                "project_name": current_project_name,
                "file_id": file_unique_id,
                "status": "failed",
                "error": str(e),
                "detail": error_detail
            })
    
    if all(result["status"] == "imported" for result in results):
        return {"status": "success", "rows_imported": total_count, "details": results}
    elif any(result["status"] == "imported" for result in results):
        return {"status": "partial_success", "rows_imported": total_count, "details": results}
    else:
        return JSONResponse(status_code=500, content={"status": "error", "details": results})


@app.get("/projects")
def get_all_projects():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT project_name, upload_batch, file_unique_id, created_at
            FROM parts_library
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"project_name": r[0], "upload_batch": r[1], "file_unique_id": r[2]} for r in rows]
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"查询项目时出错: {str(e)}"})

@app.get("/project_names")
def get_project_names():
    """
    获取所有不同的项目名称
    """
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT project_name
            FROM parts_library
            ORDER BY project_name
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [row[0] for row in rows]
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"查询项目名称时出错: {str(e)}"})
# 添加获取所有零部件的API
@app.get("/parts")
def get_all_parts(project_name: str = None):
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        if project_name:
            cur.execute("""
                SELECT * FROM parts_library 
                WHERE project_name = %s
                ORDER BY created_at DESC
            """, (project_name,))
        else:
            cur.execute("""
                SELECT * FROM parts_library 
                ORDER BY created_at DESC
            """)
            
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        cur.close()
        conn.close()
        
        # 转换为字典列表
        result = []
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
            result.append(part_dict)
            
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"查询零部件时出错: {str(e)}"})


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
def merge_parts(req: MergeRequest):
    try:
        project_names = req.project_names
        if not project_names:
            return []

        conn = get_connection()
        cur = conn.cursor()
        
        placeholders = ','.join(['%s'] * len(project_names))
        query = f"""
            SELECT * FROM parts_library 
            WHERE project_name IN ({placeholders})
            ORDER BY project_name, created_at DESC
        """
        cur.execute(query, project_names)
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        cur.close()
        conn.close()
        
        result = []
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
            result.append(part_dict)
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"合并零部件时出错: {str(e)}"})

@app.post("/merge_parts_by_file_ids")
def merge_parts_by_file_ids(req: MergeByFileIdsRequest):
    try:
        file_unique_ids = req.file_unique_ids
        if not file_unique_ids:
            return []

        conn = get_connection()
        cur = conn.cursor()
        
        placeholders = ','.join(['%s'] * len(file_unique_ids))
        query = f"""
            SELECT * FROM parts_library 
            WHERE file_unique_id IN ({placeholders})
            ORDER BY project_name, created_at DESC
        """
        cur.execute(query, file_unique_ids)
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        cur.close()
        conn.close()
        
        result = []
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
            result.append(part_dict)
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"通过文件ID合并零部件时出错: {str(e)}"})



@app.post("/update_parts")
def update_parts(req: UpdatePartsRequest):
    try:
        conn = get_connection()
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
        conn.close()
        
        return {"status": "success", "updated_count": updated_count}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"更新零部件失败: {str(e)}"})


# 保存合并项目API
@app.post("/save_merged_project")
def save_merged_project(req: SaveMergedProjectRequest):
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # 插入合并项目记录
        if req.source_file_ids:
            cur.execute("""
                INSERT INTO merged_projects (merged_project_name, source_projects, source_file_ids, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (req.merged_project_name, req.source_projects, req.source_file_ids, datetime.now(), datetime.now()))
        else:
            cur.execute("""
                INSERT INTO merged_projects (merged_project_name, source_projects, created_at, updated_at)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """, (req.merged_project_name, req.source_projects, datetime.now(), datetime.now()))
        
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
        cur.close()
        conn.close()
        
        return {"status": "success", "merged_project_id": merged_project_id, "message": "合并项目保存成功"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"保存合并项目失败: {str(e)}"})

# 获取所有合并项目API
@app.get("/merged_projects")
def get_merged_projects():
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, merged_project_name, source_projects, created_at
            FROM merged_projects
            ORDER BY created_at DESC
        """)
        
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        result = []
        for row in rows:
            result.append({
                "id": row[0],
                "merged_project_name": row[1],
                "source_projects": row[2],
                "created_at": row[3].isoformat() if row[3] else None
            })
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"获取合并项目时出错: {str(e)}"})

# 获取合并项目的零部件API
@app.get("/merged_project_parts/{merged_project_id}")
def get_merged_project_parts(merged_project_id: int):
    try:
        conn = get_connection()
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

# 导出合并项目为Excel API
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

# 删除普通项目API
@app.delete("/projects/{project_name}")
def delete_project(project_name: str):
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # 删除指定项目的所有零部件
        cur.execute("""
            DELETE FROM parts_library
            WHERE project_name = %s
        """, (project_name,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return {"status": "success", "message": "项目删除成功"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"删除项目失败: {str(e)}"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8596, reload=True)
