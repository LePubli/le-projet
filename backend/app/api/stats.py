from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import get_db
from app.models.panne import Panne
from app.models.intervention import Intervention
from app.models.machine import Machine
from app.core.security import get_current_user

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/")
def get_stats(db: Session = Depends(get_db), _=Depends(get_current_user)):
    total_machines = db.query(Machine).count()
    total_pannes = db.query(Panne).count()
    total_interventions = db.query(Intervention).count()
    interventions_validees = db.query(Intervention).filter(Intervention.validee == True).count()

    top_pannes = db.query(Panne.titre, func.count(Intervention.id).label("count"))\
        .join(Intervention, Intervention.panne_id == Panne.id, isouter=True)\
        .group_by(Panne.id)\
        .order_by(func.count(Intervention.id).desc())\
        .limit(5).all()

    avg_repair = db.query(func.avg(Panne.temps_moyen_reparation)).scalar()

    machines_statut = db.query(Machine.statut, func.count(Machine.id).label("count"))\
        .group_by(Machine.statut).all()

    pannes_criticite = db.query(Panne.criticite, func.count(Panne.id).label("count"))\
        .group_by(Panne.criticite).order_by(Panne.criticite).all()

    return {
        "total_machines": total_machines,
        "total_pannes": total_pannes,
        "total_interventions": total_interventions,
        "interventions_validees": interventions_validees,
        "top_pannes": [{"titre": t, "count": c} for t, c in top_pannes],
        "avg_repair_minutes": round(avg_repair, 1) if avg_repair else 0,
        "machines_par_statut": [{"statut": s, "count": c} for s, c in machines_statut],
        "pannes_par_criticite": [{"criticite": cr, "count": c} for cr, c in pannes_criticite],
    }
