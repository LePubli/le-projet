from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from app.db.database import get_db
from app.models.maintenance_preventive import MaintenancePreventive
from app.models.machine import Machine
from app.models.convoyeur import Convoyeur
from app.schemas.maintenance_preventive import (
    MaintenancePreventiveCreate,
    MaintenancePreventiveUpdate,
    MaintenancePreventiveOut,
)
from app.core.security import get_current_user, require_manager_or_admin
from app.core.activity import log_activity
from app.core.notifications import create_notification

router = APIRouter(prefix="/api/maintenance-preventive", tags=["maintenance-preventive"])


def compute_echeance(mp: MaintenancePreventive):
    base = mp.derniere_execution or mp.created_at
    if base is None:
        return None
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    return base + timedelta(days=mp.frequence_jours)


def compute_statut(prochaine: datetime | None, alert_jours: int):
    if prochaine is None:
        return "inconnu", None
    now = datetime.now(tz=timezone.utc)
    if prochaine.tzinfo is None:
        prochaine = prochaine.replace(tzinfo=timezone.utc)
    delta = (prochaine - now).days
    if delta < 0:
        return "en_retard", delta
    elif delta <= alert_jours:
        return "bientot", delta
    else:
        return "ok", delta


def enrich(mp: MaintenancePreventive) -> MaintenancePreventiveOut:
    prochaine = compute_echeance(mp)
    statut, jours = compute_statut(prochaine, mp.alert_jours or 7)
    return MaintenancePreventiveOut(
        id=mp.id,
        machine_id=mp.machine_id,
        titre=mp.titre,
        description=mp.description,
        frequence_jours=mp.frequence_jours,
        responsable=mp.responsable,
        alert_jours=mp.alert_jours,
        actif=mp.actif,
        derniere_execution=mp.derniere_execution,
        created_at=mp.created_at,
        machine_nom=(
            mp.machine.nom if mp.machine else (mp.convoyeur.nom if mp.convoyeur else None)
        ),
        prochaine_echeance=prochaine,
        statut=statut,
        jours_restants=jours,
    )


def check_and_notify(db: Session, mp: MaintenancePreventive):
    prochaine = compute_echeance(mp)
    statut, jours = compute_statut(prochaine, mp.alert_jours or 7)
    if statut in ("en_retard", "bientot"):
        label = "en retard" if statut == "en_retard" else f"dans {jours} jour(s)"
        create_notification(
            db,
            title=f"Maintenance préventive : {mp.titre}",
            message=(
                f"{mp.machine.nom if mp.machine else (mp.convoyeur.nom if mp.convoyeur else '')}"
                f" — échéance {label}"
            ),
            notif_type="majeure" if statut == "en_retard" else "info",
            entity_type="maintenance",
            entity_id=mp.id,
        )


@router.get("/", response_model=list[MaintenancePreventiveOut])
def list_maintenances(
    actif_only: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(MaintenancePreventive)
    if actif_only:
        q = q.filter(MaintenancePreventive.actif.is_(True))
    items = q.order_by(MaintenancePreventive.created_at.desc()).all()
    return [enrich(mp) for mp in items]


@router.get("/{mp_id}", response_model=MaintenancePreventiveOut)
def get_maintenance(mp_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    mp = db.query(MaintenancePreventive).filter(MaintenancePreventive.id == mp_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="Maintenance introuvable")
    return enrich(mp)


@router.post("/", response_model=MaintenancePreventiveOut)
def create_maintenance(
    mp_in: MaintenancePreventiveCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    if mp_in.machine_id is not None:
        machine = db.query(Machine).filter(Machine.id == mp_in.machine_id).first()
        if not machine:
            raise HTTPException(status_code=404, detail="Machine introuvable")
    else:
        convoyeur = db.query(Convoyeur).filter(Convoyeur.id == mp_in.convoyeur_id).first()
        if not convoyeur:
            raise HTTPException(status_code=404, detail="Convoyeur introuvable")
    mp = MaintenancePreventive(**mp_in.model_dump())
    db.add(mp)
    db.commit()
    db.refresh(mp)
    log_activity(db, current_user, "créé", "maintenance", mp.id, mp.titre)
    return enrich(mp)


@router.put("/{mp_id}", response_model=MaintenancePreventiveOut)
def update_maintenance(
    mp_id: int,
    mp_in: MaintenancePreventiveUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    mp = db.query(MaintenancePreventive).filter(MaintenancePreventive.id == mp_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="Maintenance introuvable")
    for key, value in mp_in.model_dump(exclude_unset=True).items():
        setattr(mp, key, value)
    db.commit()
    db.refresh(mp)
    log_activity(db, current_user, "modifié", "maintenance", mp.id, mp.titre)
    return enrich(mp)


@router.post("/{mp_id}/effectuer", response_model=MaintenancePreventiveOut)
def marquer_effectue(
    mp_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    mp = db.query(MaintenancePreventive).filter(MaintenancePreventive.id == mp_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="Maintenance introuvable")
    mp.derniere_execution = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(mp)
    log_activity(db, current_user, "effectué", "maintenance", mp.id, mp.titre)
    return enrich(mp)


@router.delete("/{mp_id}")
def delete_maintenance(
    mp_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    mp = db.query(MaintenancePreventive).filter(MaintenancePreventive.id == mp_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="Maintenance introuvable")
    label = mp.titre
    db.delete(mp)
    db.commit()
    log_activity(db, current_user, "supprimé", "maintenance", mp_id, label)
    return {"ok": True}
