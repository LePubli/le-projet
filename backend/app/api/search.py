"""Recherche globale multi-entités avec support trigramme (fuzzy matching).

Si l'extension PostgreSQL `pg_trgm` est disponible, on utilise `similarity()`
pour tolérer les fautes de frappe et les espaces manquants (ex: "L 315" → L315).
Sinon, fallback sur `ILIKE` classique.

Entités recherchées : machines, pannes, interventions, bons-travail, base de connaissances.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, text, func
from app.db.database import get_db, engine
from app.models.machine import Machine
from app.models.panne import Panne
from app.models.intervention import Intervention
from app.models.bon_travail import BonTravail
from app.core.security import get_current_user
from app.core.logging import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


# ─── Détection pg_trgm (une seule fois au démarrage du module) ──────────────
_TRIGRAM_AVAILABLE = False
try:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        conn.commit()
    _TRIGRAM_AVAILABLE = True
    log.info("search_trigram_enabled")
except Exception as e:
    log.warning("search_trigram_unavailable", error=str(e)[:200])
    # Fallback ILIKE — fonctionnel mais sans tolérance aux fautes


def _fuzzy_filter(column, q: str):
    """Retourne un filtre SQLAlchemy fuzzy pour une colonne texte.
    - Si pg_trgm est dispo : similarity(col, q) > 0.1 OR col ILIKE %q%
    - Sinon : col ILIKE %q%
    """
    term = f"%{q}%"
    if _TRIGRAM_AVAILABLE:
        # similarity() retourne 0..1 ; 0.1 est un seuil permissif
        return or_(
            text(f"similarity({column.key}, :q) > 0.1").bindparams(q=q),
            column.ilike(term),
        )
    return column.ilike(term)


@router.get("/")
def search(q: str = Query(..., min_length=1), db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Recherche globale fuzzy. Retourne des résultats groupés par type d'entité."""
    results = {"machines": [], "pannes": [], "interventions": [], "bons_travail": [], "base_connaissances": [], "lignes": []}
    term = f"%{q}%"

    # ─── Machines ─────────────────────────────────────────────
    machines_q = db.query(Machine).filter(
        or_(
            _fuzzy_filter(Machine.nom, q),
            _fuzzy_filter(Machine.code_interne, q),
            _fuzzy_filter(Machine.fabricant, q),
            _fuzzy_filter(Machine.modele, q),
            Machine.site.ilike(term),
            Machine.ligne.ilike(term),
            Machine.zone.ilike(term),
        )
    )
    if _TRIGRAM_AVAILABLE:
        machines_q = machines_q.order_by(
            func.similarity(Machine.nom, q).desc(),
            func.similarity(Machine.code_interne, q).desc(),
        )
    machines = machines_q.limit(15).all()
    results["machines"] = [
        {
            "id": m.id, "nom": m.nom, "code_interne": m.code_interne,
            "statut": m.statut, "ligne": m.ligne, "zone": m.zone, "type": "machine",
        }
        for m in machines
    ]

    # ─── Lignes (agrégat) ─────────────────────────────────────
    ligne_rows = db.query(Machine.ligne).filter(Machine.ligne.ilike(term)).distinct().all()
    results["lignes"] = sorted({row[0] for row in ligne_rows if row[0]})

    # ─── Pannes ───────────────────────────────────────────────
    pannes_q = db.query(Panne).filter(
        or_(
            _fuzzy_filter(Panne.titre, q),
            _fuzzy_filter(Panne.description, q),
            _fuzzy_filter(Panne.cause_reelle, q),
            _fuzzy_filter(Panne.solution, q),
        )
    )
    if _TRIGRAM_AVAILABLE:
        pannes_q = pannes_q.order_by(func.similarity(Panne.titre, q).desc())
    pannes = pannes_q.limit(10).all()
    # Pour chaque panne, récupérer le nom de la machine
    machine_cache: dict[int, str] = {}
    for p in pannes:
        if p.machine_id not in machine_cache:
            m = db.query(Machine).filter(Machine.id == p.machine_id).first()
            machine_cache[p.machine_id] = m.nom if m else f"#{p.machine_id}"
    results["pannes"] = [
        {
            "id": p.id, "titre": p.titre, "criticite": p.criticite,
            "machine_id": p.machine_id, "machine_nom": machine_cache.get(p.machine_id, ""),
            "type": "panne",
        }
        for p in pannes
    ]

    # ─── Interventions ────────────────────────────────────────
    interventions = db.query(Intervention).filter(
        or_(
            _fuzzy_filter(Intervention.technicien, q),
            _fuzzy_filter(Intervention.commentaire, q),
        )
    ).limit(10).all()
    results["interventions"] = [
        {"id": i.id, "technicien": i.technicien, "machine_id": i.machine_id, "type": "intervention"}
        for i in interventions
    ]

    # ─── Bons de Travail ──────────────────────────────────────
    bts_q = db.query(BonTravail).filter(
        or_(
            _fuzzy_filter(BonTravail.titre, q),
            _fuzzy_filter(BonTravail.description, q),
            _fuzzy_filter(BonTravail.numero, q),
        )
    )
    if _TRIGRAM_AVAILABLE:
        bts_q = bts_q.order_by(func.similarity(BonTravail.titre, q).desc())
    bts = bts_q.limit(10).all()
    results["bons_travail"] = [
        {
            "id": bt.id, "numero": bt.numero, "titre": bt.titre, "type_bt": bt.type_bt,
            "statut": bt.statut, "type": "bon_travail",
        }
        for bt in bts
    ]

    # ─── Base de connaissances (pannes avec solution) ─────────
    base_q = db.query(Panne).filter(
        Panne.solution.isnot(None),
        Panne.solution != "",
        or_(
            _fuzzy_filter(Panne.titre, q),
            _fuzzy_filter(Panne.cause_reelle, q),
            _fuzzy_filter(Panne.solution, q),
        ),
    )
    if _TRIGRAM_AVAILABLE:
        base_q = base_q.order_by(func.similarity(Panne.titre, q).desc())
    base = base_q.limit(10).all()
    results["base_connaissances"] = [
        {
            "id": p.id, "titre": p.titre, "cause_reelle": p.cause_reelle,
            "solution": p.solution[:120] + "..." if p.solution and len(p.solution) > 120 else p.solution,
            "criticite": p.criticite, "type": "base",
        }
        for p in base
    ]

    return results
