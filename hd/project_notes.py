from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import get_connection, get_async_db_connection
from typing import Optional, List

router = APIRouter()

class ProjectNote(BaseModel):
    project_name: str
    file_unique_id: Optional[str] = None
    note: Optional[str] = None

class ProjectNoteResponse(BaseModel):
    id: int
    project_name: str
    file_unique_id: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

@router.get("/project_notes", response_model=List[ProjectNoteResponse])
async def get_project_notes():
    """获取所有项目备注"""
    try:
        async with get_async_db_connection() as conn:
            rows = await conn.fetch("""
                SELECT id, project_name, file_unique_id, note, created_at, updated_at
                FROM project_notes
                ORDER BY updated_at DESC
            """)
        
        result = []
        for row in rows:
            result.append({
                "id": row['id'],
                "project_name": row['project_name'],
                "file_unique_id": row['file_unique_id'],
                "note": row['note'],
                "created_at": row['created_at'].isoformat() if row['created_at'] else None,
                "updated_at": row['updated_at'].isoformat() if row['updated_at'] else None
            })
        return result
    except Exception as e:
        # 记录详细的错误信息
        import traceback
        error_detail = f"获取项目备注失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"获取项目备注失败: {str(e)}")

@router.get("/project_notes/{project_name}", response_model=ProjectNoteResponse)
async def get_project_note(project_name: str):
    """获取指定项目的备注（路径参数）"""
    try:
        # 记录请求的项目名称，用于调试
        print(f"路径参数请求的项目名称: {project_name}")
        
        # 使用通用函数获取项目备注
        return await get_project_note_internal(project_name)
    except Exception as e:
        # 记录详细的错误信息
        import traceback
        error_detail = f"获取项目备注失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"获取项目备注失败: {str(e)}")

@router.get("/project_notes/by_name", response_model=ProjectNoteResponse)
async def get_project_note_by_name(project_name: str):
    """通过查询参数获取指定项目的备注"""
    try:
        # 记录请求的项目名称，用于调试
        print(f"查询参数请求的项目名称: {project_name}")
        
        # 使用通用函数获取项目备注
        return await get_project_note_internal(project_name)
    except Exception as e:
        # 记录详细的错误信息
        import traceback
        error_detail = f"获取项目备注失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"获取项目备注失败: {str(e)}")

async def get_project_note_internal(project_name: str):
    """内部函数：获取指定项目的备注"""
    try:
        async with get_async_db_connection() as conn:
            row = await conn.fetchrow("""
                SELECT id, project_name, file_unique_id, note, created_at, updated_at
                FROM project_notes
                WHERE project_name = $1
            """, project_name)
        
        if not row:
            return {"id": 0, "project_name": project_name, "file_unique_id": None, "note": "", "created_at": None, "updated_at": None}
        
        # 确保日期时间字段正确处理
        created_at = row['created_at'].isoformat() if row['created_at'] else None
        updated_at = row['updated_at'].isoformat() if row['updated_at'] else None
        
        return {
            "id": row['id'],
            "project_name": row['project_name'],
            "file_unique_id": row['file_unique_id'],
            "note": row['note'],
            "created_at": created_at,
            "updated_at": updated_at
        }
    except Exception as e:
        # 记录详细的错误信息
        import traceback
        error_detail = f"获取项目备注内部函数失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"获取项目备注失败: {str(e)}")

@router.post("/project_notes", response_model=ProjectNoteResponse)
async def create_or_update_project_note(note: ProjectNote):
    """创建或更新项目备注"""
    try:
        async with get_async_db_connection() as conn:
            # 检查是否已存在该项目的备注
            if note.file_unique_id:
                existing = await conn.fetchrow("""
                    SELECT id FROM project_notes WHERE file_unique_id = $1
                """, note.file_unique_id)
            else:
                existing = await conn.fetchrow("""
                    SELECT id FROM project_notes WHERE project_name = $1
                """, note.project_name)
            
            if existing:
                # 更新现有备注
                if note.file_unique_id:
                    row = await conn.fetchrow("""
                        UPDATE project_notes
                        SET note = $1, updated_at = NOW()
                        WHERE file_unique_id = $2
                        RETURNING id, project_name, file_unique_id, note, created_at, updated_at
                    """, note.note, note.file_unique_id)
                else:
                    row = await conn.fetchrow("""
                        UPDATE project_notes
                        SET note = $1, updated_at = NOW()
                        WHERE project_name = $2
                        RETURNING id, project_name, file_unique_id, note, created_at, updated_at
                    """, note.note, note.project_name)
            else:
                # 创建新备注
                row = await conn.fetchrow("""
                    INSERT INTO project_notes (project_name, file_unique_id, note)
                    VALUES ($1, $2, $3)
                    RETURNING id, project_name, file_unique_id, note, created_at, updated_at
                """, note.project_name, note.file_unique_id, note.note)
        
        return {
            "id": row['id'],
            "project_name": row['project_name'],
            "file_unique_id": row['file_unique_id'],
            "note": row['note'],
            "created_at": row['created_at'].isoformat() if row['created_at'] else None,
            "updated_at": row['updated_at'].isoformat() if row['updated_at'] else None
        }
    except Exception as e:
        # 记录详细的错误信息
        import traceback
        error_detail = f"保存项目备注失败: {str(e)}\n详细信息: {traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"保存项目备注失败: {str(e)}")