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


@app.post("/upload_parts_excel")
async def upload_parts_excel(
    file: UploadFile = File(...),
    project_name: str = Query(default=None)
):
    # 如果 project_name 为空，则用文件名（去扩展名）作为默认值
    if not project_name:
        filename = file.filename  # 例如 s500.xlsx
        project_name = os.path.splitext(filename)[0]  # 结果 s500

    upload_batch = f"batch_{project_name}_001"
    try:
        count = import_excel_to_db(file.file, upload_batch, project_name)
        return {"status": "success", "rows_imported": count}
    except Exception as e:
        error_detail = f"导入错误: {str(e)}\n详细信息: {traceback.format_exc()}"
        return JSONResponse(status_code=500, content={"error": str(e), "detail": error_detail})


@app.get("/projects")
def get_all_projects():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT project_name, upload_batch, created_at
            FROM parts_library
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"project_name": r[0], "upload_batch": r[1]} for r in rows]
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
            result.append(dict(zip(columns, row)))
            
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"查询零部件时出错: {str(e)}"})


# 添加合并多个项目的零部件API
from pydantic import BaseModel
from typing import List

class MergeRequest(BaseModel):
    project_names: List[str]

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

        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"合并零部件时出错: {str(e)}"})



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8596, reload=True)