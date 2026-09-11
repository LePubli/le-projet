"""CRUD pour les filtres sauvegardés par utilisateur."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.db.database import get_db
from app.models.saved_filter import SavedFilter
from app.core.security import get_current_user
from app.core.activity import log_activity

router = APIRouter(prefix="/api/saved-filters", tags=["saved-filters"])


class SavedFilterCreate(BaseModel):
    name: str
    entity: str  # "pannes", "bons-travail", "machines", etc.
    filters: Dict[str, Any]


class SavedFilterOut(BaseModel):
    id: int
    name: str
    entity: str
    filters: Dict[str, Any]
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[SavedFilterOut])
def list_my_filters(
    entity: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Liste les filtres sauvegardés de l'utilisateur courant, optionnellement filtrés par entité."""
    q = db.query(SavedFilter).filter(SavedFilter.user_id == current_user.id)
    if entity:
        q = q.filter(SavedFilter.entity == entity)
    return q.order_by(SavedFilter.created_at.desc()).all()


@router.post("/", response_model=SavedFilterOut)
def create_filter(
    body: SavedFilterCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Sauvegarde un nouveau filtre pour l'utilisateur courant."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Le nom est requis")
    sf = SavedFilter(
        user_id=current_user.id,
        name=body.name.strip(),
        entity=body.entity,
        filters=body.filters,
    )
    db.add(sf)
    db.commit()
    db.refresh(sf)
    log_activity(db, current_user, "créé", "saved_filter", sf.id, sf.name)
    return sf


@router.delete("/{filter_id}")
def delete_filter(
    filter_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Supprime un filtre sauvegardé (appartient à l'utilisateur courant)."""
    sf = db.query(SavedFilter).filter(
        SavedFilter.id == filter_id,
        SavedFilter.user_id == current_user.id,
    ).first()
    if not sf:
        raise HTTPException(status_code=404, detail="Filtre introuvable")
    label = sf.name
    db.delete(sf)
    db.commit()
    log_activity(db, current_user, "supprimé", "saved_filter", filter_id, label)
    return {"ok": True}
