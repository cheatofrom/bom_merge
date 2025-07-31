from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import get_connection
from typing import Optional, List

router = APIRouter()

class ProjectNote(BaseModel):
    project_name: str
    note: Optional[str] = None

class ProjectNoteResponse(BaseModel):
    id: int
    project_name: str
    note: Optional[str] = None
    created_at: str
    updated_at: str

@router.get("/project_notes", response_model=List[ProjectNoteResponse])
async def get_project_notes():
    """获取所有项目备注"""
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, project_name, note, created_at, updated_at
            FROM project_notes
            ORDER BY updated_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        result = []
        for row in rows:
            result.append({
                "id": row[0],
                "project_name": row[1],
                "note": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
                "updated_at": row[4].isoformat() if row[4] else None
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取项目备注失败: {str(e)}")

@router.get("/project_notes/{project_name}", response_model=ProjectNoteResponse)
async def get_project_note(project_name: str):
    """获取指定项目的备注"""
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, project_name, note, created_at, updated_at
            FROM project_notes
            WHERE project_name = %s
        """, (project_name,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if not row:
            return {"id": 0, "project_name": project_name, "note": "", "created_at": None, "updated_at": None}
        
        return {
            "id": row[0],
            "project_name": row[1],
            "note": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
            "updated_at": row[4].isoformat() if row[4] else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取项目备注失败: {str(e)}")

@router.post("/project_notes", response_model=ProjectNoteResponse)
async def create_or_update_project_note(note: ProjectNote):
    """创建或更新项目备注"""
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # 检查是否已存在该项目的备注
        cur.execute("""
            SELECT id FROM project_notes WHERE project_name = %s
        """, (note.project_name,))
        existing = cur.fetchone()
        
        if existing:
            # 更新现有备注
            cur.execute("""
                UPDATE project_notes
                SET note = %s, updated_at = NOW()
                WHERE project_name = %s
                RETURNING id, project_name, note, created_at, updated_at
            """, (note.note, note.project_name))
        else:
            # 创建新备注
            cur.execute("""
                INSERT INTO project_notes (project_name, note)
                VALUES (%s, %s)
                RETURNING id, project_name, note, created_at, updated_at
            """, (note.project_name, note.note))
        
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return {
            "id": row[0],
            "project_name": row[1],
            "note": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
            "updated_at": row[4].isoformat() if row[4] else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存项目备注失败: {str(e)}")