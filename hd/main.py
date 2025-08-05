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


import uuid

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
        try:
            count = import_excel_to_db(file.file, upload_batch, current_project_name, file_unique_id)
            total_count += count
            results.append({
                "filename": file.filename,
                "project_name": current_project_name,
                "file_id": file_unique_id,
                "status": "success",
                "rows_imported": count
            })
        except Exception as e:
            error_detail = f"导入错误: {str(e)}\n详细信息: {traceback.format_exc()}"
            results.append({
                "filename": file.filename,
                "project_name": current_project_name,
                "file_id": file_unique_id,
                "status": "error",
                "error": str(e),
                "detail": error_detail
            })
    
    if all(result["status"] == "success" for result in results):
        return {"status": "success", "rows_imported": total_count, "details": results}
    elif any(result["status"] == "success" for result in results):
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

class MergeRequest(BaseModel):
    project_names: List[str]
    
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8596, reload=True)
