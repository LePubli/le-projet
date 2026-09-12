"""API publique avec token dédié + gestion des tokens API.

L'API publique permet à des systèmes tiers (ERP, supervision) d'accéder
aux données en lecture via un token dédié (header X-API-Token),
sans nécessiter de compte utilisateur JWT.
"""

import secrets
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from sqlalchemy import distinct
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from typing import Optional, List
from app.db.database import get_db
from app.models.api_token import ApiToken
from app.models.machine import Machine
from app.models.panne import Panne
from app.core.security import require_admin
from app.core.logging import get_logger

log = get_logger(__name__)

# ─── Router admin (gestion des tokens) ───────────────────────
admin_router = APIRouter(prefix="/api/api-tokens", tags=["api-tokens"])

# ─── Router public (accès aux données via token) ─────────────
public_router = APIRouter(prefix="/api/public", tags=["public-api"])


class ApiTokenOut(BaseModel):
    id: int
    name: str
    token: str
    is_active: bool
    created_at: Optional[datetime] = None
    last_used: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApiTokenCreate(BaseModel):
    name: str


# ─── Dépendance : vérifier le token API ──────────────────────
def get_api_token(
    x_api_token: Optional[str] = Header(None, alias="X-API-Token"),
    db: Session = Depends(get_db),
):
    """Vérifie le token API dans le header X-API-Token."""
    if not x_api_token:
        raise HTTPException(status_code=401, detail="X-API-Token header requis")
    token = (
        db.query(ApiToken)
        .filter(
            ApiToken.token == x_api_token,
            ApiToken.is_active,
        )
        .first()
    )
    if not token:
        raise HTTPException(status_code=403, detail="Token API invalide ou désactivé")
    # Mettre à jour last_used
    token.last_used = datetime.now(timezone.utc)
    db.commit()
    return token


# ─── Endpoints admin : CRUD tokens ───────────────────────────
@admin_router.get("/", response_model=List[ApiTokenOut])
def list_tokens(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(ApiToken).order_by(ApiToken.created_at.desc()).all()


@admin_router.post("/", response_model=ApiTokenOut)
def create_token(body: ApiTokenCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Le nom est requis")
    token = ApiToken(
        name=body.name.strip(),
        token=secrets.token_urlsafe(32),
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    log.info("api_token_created", name=token.name)
    return token


@admin_router.delete("/{token_id}")
def delete_token(token_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    token = db.query(ApiToken).filter(ApiToken.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token introuvable")
    db.delete(token)
    db.commit()
    return {"ok": True}


@admin_router.put("/{token_id}/toggle")
def toggle_token(token_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    token = db.query(ApiToken).filter(ApiToken.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token introuvable")
    token.is_active = not token.is_active
    db.commit()
    return {"ok": True, "is_active": token.is_active}


# ─── Endpoints publics (lecture seule, via X-API-Token) ─────


@public_router.get("/machines")
def public_machines(
    site: Optional[str] = None,
    ligne: Optional[str] = None,
    zone: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(get_api_token),
):
    """Liste des machines (lecture seule pour intégration ERP)."""
    q = db.query(Machine)
    if site:
        q = q.filter(Machine.site == site)
    if ligne:
        q = q.filter(Machine.ligne == ligne)
    if zone:
        q = q.filter(Machine.zone == zone)
    return q.limit(500).all()


@public_router.get("/pannes")
def public_pannes(
    machine_id: Optional[int] = None,
    criticite_min: Optional[int] = None,
    days: int = Query(30, description="Pannes des N derniers jours"),
    db: Session = Depends(get_db),
    _=Depends(get_api_token),
):
    """Liste des pannes récentes (lecture seule)."""
    q = db.query(Panne)
    if machine_id:
        q = q.filter(Panne.machine_id == machine_id)
    if criticite_min:
        q = q.filter(Panne.criticite >= criticite_min)
    if days > 0:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        q = q.filter(Panne.created_at >= since)
    return q.order_by(Panne.created_at.desc()).limit(200).all()


@public_router.get("/kpi")
def public_kpi(
    db: Session = Depends(get_db),
    _=Depends(get_api_token),
):
    """KPIs de base pour intégration supervision."""
    total_machines = db.query(Machine).count()
    total_pannes = db.query(Panne).count()
    open_pannes = db.query(Panne).filter(Panne.solution.is_(None)).count()
    critical_pannes = db.query(Panne).filter(Panne.criticite >= 4).count()
    machines_en_panne = db.query(Machine).filter(Machine.statut == "en_panne").count()

    return {
        "total_machines": total_machines,
        "total_pannes": total_pannes,
        "open_pannes": open_pannes,
        "critical_pannes": critical_pannes,
        "machines_en_panne": machines_en_panne,
        "taux_disponibilite": round(
            (total_machines - machines_en_panne) / max(total_machines, 1) * 100, 2
        ),
    }


@public_router.get("/sites")
def public_sites(
    db: Session = Depends(get_db),
    _=Depends(get_api_token),
):
    """Liste des sites disponibles."""
    sites = db.query(distinct(Machine.site)).filter(Machine.site.isnot(None)).all()
    return sorted([s[0] for s in sites if s[0]])
