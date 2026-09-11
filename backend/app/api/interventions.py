from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.intervention import Intervention
from app.schemas.intervention import InterventionCreate, InterventionUpdate, InterventionOut
from app.core.security import get_current_user, require_manager_or_admin
from app.core.activity import log_activity, apply_update_and_log
from app.core.notifications import create_notification

router = APIRouter(prefix="/api/interventions", tags=["interventions"])

VALID_TYPES_BT = ["reparation", "nettoyage", "entretien"]
VALID_STATUTS = ["en_cours", "termine", "valide"]


@router.get("/", response_model=list[InterventionOut])
def list_interventions(
    skip: int = 0,
    limit: int = 100,
    machine_id: int = None,
    type_bt: str = None,
    statut: str = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(Intervention)
    if machine_id:
        q = q.filter(Intervention.machine_id == machine_id)
    if type_bt and type_bt in VALID_TYPES_BT:
        q = q.filter(Intervention.type_bt == type_bt)
    if statut and statut in VALID_STATUTS:
        q = q.filter(Intervention.statut == statut)
    return q.order_by(Intervention.date_intervention.desc()).offset(skip).limit(limit).all()


@router.get("/{intervention_id}", response_model=InterventionOut)
def get_intervention(
    intervention_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)
):
    inter = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not inter:
        raise HTTPException(status_code=404, detail="Intervention not found")
    return inter


@router.post("/", response_model=InterventionOut)
def create_intervention(
    inter_in: InterventionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    inter = Intervention(**inter_in.model_dump())
    db.add(inter)
    db.commit()
    db.refresh(inter)
    label = inter.commentaire[:60] if inter.commentaire else f"BT {inter.type_bt} #{inter.id}"
    log_activity(db, current_user, "créé", "intervention", inter.id, label)
    create_notification(
        db,
        title=f"Nouveau BT {inter.type_bt}",
        message=f"{label} — soumis par {current_user.username}",
        notif_type="info",
        entity_type="intervention",
        entity_id=inter.id,
    )
    return inter


@router.put("/{intervention_id}", response_model=InterventionOut)
def update_intervention(
    intervention_id: int,
    inter_in: InterventionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    inter = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not inter:
        raise HTTPException(status_code=404, detail="Intervention not found")
    apply_update_and_log(
        db,
        inter,
        inter_in.model_dump(exclude_unset=True),
        current_user,
        "intervention",
        label_fn=lambda i: i.commentaire[:60] if i.commentaire else f"BT {i.type_bt} #{i.id}",
        with_diff=False,
    )
    return inter


@router.post("/{intervention_id}/valider", response_model=InterventionOut)
def valider_intervention(
    intervention_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    inter = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not inter:
        raise HTTPException(status_code=404, detail="Intervention not found")
    inter.validee = True
    inter.validee_par = current_user.username
    inter.statut = "valide"
    db.commit()
    db.refresh(inter)
    label = inter.commentaire[:60] if inter.commentaire else f"BT {inter.type_bt} #{inter.id}"
    log_activity(db, current_user, "validé", "intervention", inter.id, label)
    return inter


@router.post("/{intervention_id}/terminer", response_model=InterventionOut)
def terminer_intervention(
    intervention_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    inter = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not inter:
        raise HTTPException(status_code=404, detail="Intervention not found")
    inter.statut = "termine"
    db.commit()
    db.refresh(inter)
    label = inter.commentaire[:60] if inter.commentaire else f"BT {inter.type_bt} #{inter.id}"
    log_activity(db, current_user, "terminé", "intervention", inter.id, label)
    return inter


@router.delete("/{intervention_id}")
def delete_intervention(
    intervention_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    inter = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not inter:
        raise HTTPException(status_code=404, detail="Intervention not found")
    label = inter.commentaire[:60] if inter.commentaire else f"BT {inter.type_bt} #{inter.id}"
    db.delete(inter)
    db.commit()
    log_activity(db, current_user, "supprimé", "intervention", intervention_id, label)
    return {"ok": True}
