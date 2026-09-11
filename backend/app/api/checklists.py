from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.db.database import get_db
from app.models.safety_checklist import SafetyChecklist
from app.core.security import get_current_user, require_manager_or_admin
from app.core.activity import log_activity

router = APIRouter(prefix="/api/checklists", tags=["checklists"])


# ─── Schémas Pydantic ──────────────────────────────────────────────────────

class ChecklistCreate(BaseModel):
    titre: str
    description: Optional[str] = None
    etapes: List = []
    zone: Optional[str] = None
    type_equip: Optional[str] = None


class ChecklistUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    etapes: Optional[List] = None
    zone: Optional[str] = None
    type_equip: Optional[str] = None
    actif: Optional[bool] = None


class ChecklistOut(BaseModel):
    id: int
    titre: str
    description: Optional[str] = None
    etapes: List = []
    zone: Optional[str] = None
    type_equip: Optional[str] = None
    actif: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Routes ────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[ChecklistOut])
def list_checklists(
    zone: str = Query(None),
    type_equip: str = Query(None),
    actif: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(SafetyChecklist)
    if zone:
        q = q.filter(SafetyChecklist.zone == zone)
    if type_equip:
        q = q.filter(SafetyChecklist.type_equip == type_equip)
    if actif is not None:
        q = q.filter(SafetyChecklist.actif == actif)
    return q.order_by(SafetyChecklist.created_at.desc()).all()


@router.get("/{checklist_id}", response_model=ChecklistOut)
def get_checklist(checklist_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cl = db.query(SafetyChecklist).filter(SafetyChecklist.id == checklist_id).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Checklist introuvable")
    return cl


@router.post("/", response_model=ChecklistOut)
def create_checklist(
    cl_in: ChecklistCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    cl = SafetyChecklist(**cl_in.model_dump())
    db.add(cl)
    db.commit()
    db.refresh(cl)
    log_activity(db, current_user, "créé", "checklist", cl.id, cl.titre)
    return cl


@router.put("/{checklist_id}", response_model=ChecklistOut)
def update_checklist(
    checklist_id: int,
    cl_in: ChecklistUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    cl = db.query(SafetyChecklist).filter(SafetyChecklist.id == checklist_id).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Checklist introuvable")
    for key, value in cl_in.model_dump(exclude_unset=True).items():
        setattr(cl, key, value)
    db.commit()
    db.refresh(cl)
    log_activity(db, current_user, "modifié", "checklist", cl.id, cl.titre)
    return cl


@router.delete("/{checklist_id}")
def delete_checklist(
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    cl = db.query(SafetyChecklist).filter(SafetyChecklist.id == checklist_id).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Checklist introuvable")
    label = cl.titre
    db.delete(cl)
    db.commit()
    log_activity(db, current_user, "supprimé", "checklist", checklist_id, label)
    return {"ok": True}


@router.post("/{checklist_id}/toggle", response_model=ChecklistOut)
def toggle_checklist(
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    cl = db.query(SafetyChecklist).filter(SafetyChecklist.id == checklist_id).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Checklist introuvable")
    cl.actif = not cl.actif
    db.commit()
    db.refresh(cl)
    etat = "activé" if cl.actif else "désactivé"
    log_activity(db, current_user, etat, "checklist", cl.id, cl.titre)
    return cl