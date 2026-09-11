from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.convoyeur import Convoyeur
from app.schemas.convoyeur import ConvoyeurCreate, ConvoyeurUpdate, ConvoyeurOut
from app.core.security import get_current_user, require_manager_or_admin
from app.core.activity import log_activity, apply_update_and_log

router = APIRouter(prefix="/api/convoyeurs", tags=["convoyeurs"])


@router.get("/", response_model=list[ConvoyeurOut])
def list_convoyeurs(
    skip: int = 0,
    limit: int = 500,
    ligne: str | None = None,
    zone: str | None = None,
    etage: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(Convoyeur)
    if ligne:
        q = q.filter(Convoyeur.ligne == ligne)
    if zone:
        q = q.filter(Convoyeur.zone == zone)
    if etage is not None:
        q = q.filter(Convoyeur.etage == etage)
    return q.offset(skip).limit(limit).all()


@router.get("/{convoyeur_id}", response_model=ConvoyeurOut)
def get_convoyeur(convoyeur_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    conv = db.query(Convoyeur).filter(Convoyeur.id == convoyeur_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Convoyeur introuvable")
    return conv


@router.post("/", response_model=ConvoyeurOut)
def create_convoyeur(
    conv_in: ConvoyeurCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    conv = Convoyeur(**conv_in.model_dump())
    db.add(conv)
    db.commit()
    db.refresh(conv)
    log_activity(db, current_user, "créé", "convoyeur", conv.id, conv.nom)
    return conv


@router.put("/{convoyeur_id}", response_model=ConvoyeurOut)
def update_convoyeur(
    convoyeur_id: int,
    conv_in: ConvoyeurUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    conv = db.query(Convoyeur).filter(Convoyeur.id == convoyeur_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Convoyeur introuvable")
    apply_update_and_log(
        db,
        conv,
        conv_in.model_dump(exclude_unset=True),
        current_user,
        "convoyeur",
        label_fn=lambda c: c.nom,
        with_diff=False,
    )
    return conv


@router.delete("/{convoyeur_id}")
def delete_convoyeur(
    convoyeur_id: int, db: Session = Depends(get_db), current_user=Depends(require_manager_or_admin)
):
    conv = db.query(Convoyeur).filter(Convoyeur.id == convoyeur_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Convoyeur introuvable")
    label = conv.nom
    db.delete(conv)
    db.commit()
    log_activity(db, current_user, "supprimé", "convoyeur", convoyeur_id, label)
    return {"ok": True}
