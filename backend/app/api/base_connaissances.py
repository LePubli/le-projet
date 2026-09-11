from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.db.database import get_db
from app.models.panne import Panne
from app.core.security import get_current_user, require_manager_or_admin, require_admin
from app.core.activity import log_activity, apply_update_and_log

router = APIRouter(prefix="/api/base-connaissances", tags=["base-connaissances"])


# ─── Schémas Pydantic ────────────────────────────────────────────────────────


class MediaItem(BaseModel):
    """Un média attaché à une cause ou une solution (photo ou vidéo)."""

    url: str
    type: str
    name: Optional[str] = None


class KnowledgeCreate(BaseModel):
    machine_id: int
    titre: str
    description: Optional[str] = None
    cause_reelle: str
    solution: str
    protocole_reparation: Optional[str] = None
    criticite: int = 3
    temps_moyen_reparation: Optional[int] = None
    causes_possibles: Optional[List[str]] = None
    cause_medias: Optional[List[MediaItem]] = None
    solution_medias: Optional[List[MediaItem]] = None


class KnowledgeUpdate(BaseModel):
    solution: Optional[str] = None
    protocole_reparation: Optional[str] = None
    cause_reelle: Optional[str] = None
    causes_possibles: Optional[List[str]] = None
    criticite: Optional[int] = None
    temps_moyen_reparation: Optional[int] = None
    cause_medias: Optional[List[MediaItem]] = None
    solution_medias: Optional[List[MediaItem]] = None


# ─── GET – Recherche dans la base de connaissances ──────────────────────────


@router.get("/")
def search_knowledge(
    q: str = Query("", description="Recherche textuelle"),
    machine_id: Optional[int] = None,
    criticite_min: Optional[int] = None,
    criticite_max: Optional[int] = None,
    avec_solution: bool = Query(False, description="Uniquement les pannes résolues avec solution"),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Base de connaissances : recherche dans les pannes résolues pour aider les techniciens."""
    query = db.query(Panne)

    if q:
        pattern = f"%{q}%"
        query = query.filter(
            (Panne.titre.ilike(pattern))
            | (Panne.description.ilike(pattern))
            | (Panne.cause_reelle.ilike(pattern))
            | (Panne.solution.ilike(pattern))
            | (Panne.protocole_reparation.ilike(pattern))
        )

    if machine_id:
        query = query.filter(Panne.machine_id == machine_id)

    if criticite_min is not None:
        query = query.filter(Panne.criticite >= criticite_min)
    if criticite_max is not None:
        query = query.filter(Panne.criticite <= criticite_max)

    if avec_solution:
        query = query.filter(Panne.solution.isnot(None), Panne.solution != "")

    # Trier par criticité décroissante puis date
    pannes = (
        query.order_by(Panne.criticite.desc(), Panne.updated_at.desc().nullslast())
        .offset(skip)
        .limit(limit)
        .all()
    )

    results = []
    for p in pannes:
        results.append(
            {
                "id": p.id,
                "machine_id": p.machine_id,
                "machine_nom": p.machine.nom if p.machine else None,
                "titre": p.titre,
                "description": p.description,
                "cause_reelle": p.cause_reelle,
                "solution": p.solution,
                "protocole_reparation": p.protocole_reparation,
                "criticite": p.criticite,
                "temps_moyen_reparation": p.temps_moyen_reparation,
                "causes_possibles": p.causes_possibles or [],
                "cause_medias": p.cause_medias or [],
                "solution_medias": p.solution_medias or [],
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
        )

    return results


# ─── POST – Créer une entrée dans la base de connaissances ──────────────────


@router.post("/")
def create_knowledge(
    body: KnowledgeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    """Crée une nouvelle entrée de connaissance (panne résolue avec solution)."""
    panne = Panne(
        machine_id=body.machine_id,
        titre=body.titre,
        description=body.description,
        cause_reelle=body.cause_reelle,
        solution=body.solution,
        protocole_reparation=body.protocole_reparation,
        criticite=body.criticite,
        temps_moyen_reparation=body.temps_moyen_reparation,
        causes_possibles=body.causes_possibles or [],
        cause_medias=[m.model_dump() for m in body.cause_medias] if body.cause_medias else [],
        solution_medias=(
            [m.model_dump() for m in body.solution_medias] if body.solution_medias else []
        ),
    )
    db.add(panne)
    db.commit()
    db.refresh(panne)
    log_activity(db, current_user, "créé", "base_connaissances", panne.id, panne.titre)
    return {
        "id": panne.id,
        "machine_id": panne.machine_id,
        "machine_nom": panne.machine.nom if panne.machine else None,
        "titre": panne.titre,
        "description": panne.description,
        "cause_reelle": panne.cause_reelle,
        "solution": panne.solution,
        "protocole_reparation": panne.protocole_reparation,
        "criticite": panne.criticite,
        "temps_moyen_reparation": panne.temps_moyen_reparation,
        "causes_possibles": panne.causes_possibles or [],
        "cause_medias": panne.cause_medias or [],
        "solution_medias": panne.solution_medias or [],
        "updated_at": panne.updated_at.isoformat() if panne.updated_at else None,
    }


# ─── PUT – Modifier une entrée de la base de connaissances ──────────────────


@router.put("/{panne_id}")
def update_knowledge(
    panne_id: int,
    body: KnowledgeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    """Met à jour les champs solution d'une entrée de la base de connaissances."""
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Entrée introuvable")

    apply_update_and_log(
        db,
        panne,
        body.model_dump(exclude_unset=True),
        current_user,
        "base_connaissances",
        label_fn=lambda p: p.titre,
        with_diff=False,
    )
    return {
        "id": panne.id,
        "machine_id": panne.machine_id,
        "machine_nom": panne.machine.nom if panne.machine else None,
        "titre": panne.titre,
        "description": panne.description,
        "cause_reelle": panne.cause_reelle,
        "solution": panne.solution,
        "protocole_reparation": panne.protocole_reparation,
        "criticite": panne.criticite,
        "temps_moyen_reparation": panne.temps_moyen_reparation,
        "causes_possibles": panne.causes_possibles or [],
        "cause_medias": panne.cause_medias or [],
        "solution_medias": panne.solution_medias or [],
        "updated_at": panne.updated_at.isoformat() if panne.updated_at else None,
    }


# ─── DELETE – Supprimer une entrée de la base de connaissances ──────────────


@router.delete("/{panne_id}")
def delete_knowledge(
    panne_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Supprime une entrée de la base de connaissances (admin uniquement)."""
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Entrée introuvable")

    label = panne.titre
    try:
        db.delete(panne)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Impossible de supprimer cette entrée : des interventions ou pièces y sont liées",
        )
    log_activity(db, current_user, "supprimé", "base_connaissances", panne_id, label)
    return {"ok": True}
