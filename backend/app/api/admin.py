from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any
from app.db.database import get_db
from app.models.activity_log import ActivityLog
from app.core.security import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class ActivityOut(BaseModel):
    id: int
    username: str
    user_role: str
    action: str
    entity_type: str
    entity_id: Optional[int]
    entity_label: Optional[str]
    changes: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/activite", response_model=list[ActivityOut])
def get_activite(
    limit: int = Query(default=60, le=200),
    entity_type: Optional[str] = None,
    username: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = db.query(ActivityLog).order_by(ActivityLog.created_at.desc())
    if entity_type:
        q = q.filter(ActivityLog.entity_type == entity_type)
    if username:
        q = q.filter(ActivityLog.username == username)
    return q.limit(limit).all()
