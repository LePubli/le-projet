from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta, timezone
from app.db.database import get_db
from app.models.panne import Panne
from app.models.intervention import Intervention
from app.models.machine import Machine
from app.models.piece import Piece, PannesPieces
from app.core.security import get_current_user

router = APIRouter(prefix="/api/kpi", tags=["kpi"])

TERMINATED_STATUTS = ("termine", "valide")


@router.get("/dashboard")
def dashboard_kpi(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """KPIs globaux du tableau de bord GMAO."""
    now = datetime.now(tz=timezone.utc)

    # ── MTTR : temps moyen de réparation (en minutes) ─────────────────
    mttr_rows = db.query(func.avg(Intervention.duree)).filter(
        Intervention.statut.in_(TERMINATED_STATUTS),
        Intervention.duree.isnot(None),
    ).first()
    mttr = round(mttr_rows[0], 1) if mttr_rows and mttr_rows[0] else 0

    # ── MTBF : temps moyen entre pannes par machine (en jours) ────────
    pannes_count = db.query(Panne).count()
    machines_count = db.query(Machine).count()
    first_panne = db.query(func.min(Panne.created_at)).scalar()
    mtbf = 0
    if pannes_count > 1 and first_panne and machines_count > 0:
        days_span = max((now - first_panne).days, 1)
        mtbf = round(days_span / (pannes_count / max(machines_count, 1)), 1)

    # ── Taux de disponibilité ─────────────────────────────────────────
    total_repair_minutes = db.query(func.coalesce(func.sum(Intervention.duree), 0)).filter(
        Intervention.statut.in_(TERMINATED_STATUTS),
        Intervention.duree.isnot(None),
    ).scalar()
    total_operational_minutes = machines_count * 525600  # 365*24*60 par machine
    taux_disponibilite = round(
        (total_operational_minutes - total_repair_minutes) / max(total_operational_minutes, 1) * 100, 2
    )

    # ── Top 5 machines avec le plus de pannes (heatmap) ───────────────
    top_machines = (
        db.query(Machine.id, Machine.nom, func.count(Panne.id).label("panne_count"))
        .join(Panne, Panne.machine_id == Machine.id)
        .group_by(Machine.id)
        .order_by(func.count(Panne.id).desc())
        .limit(5)
        .all()
    )
    top_machines_pannes = [
        {"machine_id": m.id, "machine_nom": m.nom, "panne_count": m.panne_count}
        for m in top_machines
    ]

    # ── Pannes par zone ───────────────────────────────────────────────
    pannes_zone = (
        db.query(Machine.zone, func.count(Panne.id).label("count"))
        .join(Panne, Panne.machine_id == Machine.id)
        .filter(Machine.zone.isnot(None))
        .group_by(Machine.zone)
        .order_by(func.count(Panne.id).desc())
        .all()
    )
    pannes_par_zone = [{"zone": z, "count": c} for z, c in pannes_zone]

    # ── Pannes par type_equipement (depuis machine.modele) ────────────
    pannes_type = (
        db.query(Machine.modele, func.count(Panne.id).label("count"))
        .join(Panne, Panne.machine_id == Machine.id)
        .filter(Machine.modele.isnot(None), Machine.modele != "")
        .group_by(Machine.modele)
        .order_by(func.count(Panne.id).desc())
        .all()
    )
    pannes_par_type = [{"type_equipement": t, "count": c} for t, c in pannes_type]

    # ── Interventions par technicien ──────────────────────────────────
    inter_technicien = (
        db.query(Intervention.technicien, func.count(Intervention.id).label("count"))
        .group_by(Intervention.technicien)
        .order_by(func.count(Intervention.id).desc())
        .all()
    )
    interventions_par_technicien = [{"technicien": t, "count": c} for t, c in inter_technicien]

    # ── Temps total d'intervention par technicien ─────────────────────
    temps_technicien = (
        db.query(
            Intervention.technicien,
            func.coalesce(func.sum(Intervention.duree), 0).label("total_minutes"),
        )
        .filter(Intervention.duree.isnot(None))
        .group_by(Intervention.technicien)
        .order_by(func.sum(Intervention.duree).desc())
        .all()
    )
    temps_par_technicien = [
        {"technicien": t, "total_minutes": m} for t, m in temps_technicien
    ]

    # ── Pièces les plus utilisées (top 10) ───────────────────────────
    top_pieces = (
        db.query(
            Piece.id,
            Piece.reference,
            Piece.nom,
            func.sum(PannesPieces.quantite).label("total_utilisee"),
        )
        .join(PannesPieces, PannesPieces.piece_id == Piece.id)
        .group_by(Piece.id)
        .order_by(func.sum(PannesPieces.quantite).desc())
        .limit(10)
        .all()
    )
    pieces_utilisees = [
        {"piece_id": p.id, "reference": p.reference, "nom": p.nom, "total_utilisee": p.total_utilisee}
        for p in top_pieces
    ]

    # ── Taux de pannes résolues ───────────────────────────────────────
    total_pannes = db.query(Panne).count()
    resolved_pannes_ids = (
        db.query(Intervention.panne_id)
        .filter(Intervention.panne_id.isnot(None), Intervention.statut.in_(TERMINATED_STATUTS))
        .distinct()
        .subquery()
    )
    resolved_count = db.query(func.count()).select_from(resolved_pannes_ids).scalar() or 0
    taux_resolues = round(resolved_count / max(total_pannes, 1) * 100, 1)

    # ── Tendance mensuelle : pannes par mois sur les 12 derniers mois ─
    twelve_months_ago = now - timedelta(days=365)
    monthly = (
        db.query(
            extract("year", Panne.created_at).label("year"),
            extract("month", Panne.created_at).label("month"),
            func.count(Panne.id).label("count"),
        )
        .filter(Panne.created_at >= twelve_months_ago)
        .group_by(extract("year", Panne.created_at), extract("month", Panne.created_at))
        .order_by(extract("year", Panne.created_at), extract("month", Panne.created_at))
        .all()
    )
    monthly_trend = [
        {"year": int(m.year), "month": int(m.month), "count": m.count} for m in monthly
    ]

    # ── Distribution par criticité (pour donut chart) ────────────────
    criticite_dist = (
        db.query(Panne.criticite, func.count(Panne.id).label("count"))
        .group_by(Panne.criticite)
        .order_by(Panne.criticite)
        .all()
    )
    criticite_distribution = [
        {"criticite": c or 3, "count": cnt} for c, cnt in criticite_dist
    ]

    # ── Pannes par statut (pour vue d'ensemble) ──────────────────────
    # Statut des BT comme proxy pour l'activité en cours
    from app.models.bon_travail import BonTravail
    bt_statut_dist = (
        db.query(BonTravail.statut, func.count(BonTravail.id).label("count"))
        .group_by(BonTravail.statut)
        .all()
    )
    bt_statut_distribution = [{"statut": s, "count": cnt} for s, cnt in bt_statut_dist]

    return {
        "mttr": mttr,
        "mtbf": mtbf,
        "taux_disponibilite": taux_disponibilite,
        "top_machines_pannes": top_machines_pannes,
        "pannes_par_zone": pannes_par_zone,
        "pannes_par_type": pannes_par_type,
        "interventions_par_technicien": interventions_par_technicien,
        "temps_par_technicien": temps_par_technicien,
        "pieces_utilisees": pieces_utilisees,
        "taux_pannes_resolues": taux_resolues,
        "monthly_trend": monthly_trend,
        "criticite_distribution": criticite_distribution,
        "bt_statut_distribution": bt_statut_distribution,
        "total_pannes": total_pannes,
        "total_machines": machines_count,
    }


@router.get("/heatmap")
def heatmap_data(
    days: int = Query(0, description="Filtrer sur les N derniers jours (0 = tout l'historique)"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Données pour la heatmap du schéma de zone, avec filtre temporel optionnel."""
    now = datetime.now(tz=timezone.utc)
    if days > 0:
        since = now - timedelta(days=days)
    else:
        since = None

    # ── Par zone : pannes ouvertes, pannes récentes, criticité moyenne ─
    zones = db.query(Machine.zone).filter(Machine.zone.isnot(None)).distinct().all()
    zone_data = []
    for (zone,) in zones:
        open_pannes = (
            db.query(Panne)
            .join(Machine, Machine.id == Panne.machine_id)
            .filter(Machine.zone == zone)
            .count()
        )
        recent_pannes = (
            db.query(Panne)
            .join(Machine, Machine.id == Panne.machine_id)
            .filter(Machine.zone == zone, Panne.created_at >= since)
            .count()
            if since else 0
        )
        avg_crit = (
            db.query(func.avg(Panne.criticite))
            .join(Machine, Machine.id == Panne.machine_id)
            .filter(Machine.zone == zone)
            .scalar()
        )
        zone_data.append({
            "zone": zone,
            "pannes_ouvertes": open_pannes,
            "pannes_30j": recent_pannes,
            "avg_criticite": round(avg_crit, 1) if avg_crit else 0,
        })

    # ── Par machine avec pannes (filtré par période si days > 0) ─────
    machines_q = (
        db.query(
            Machine.id,
            Machine.nom,
            func.count(Panne.id).label("panne_count"),
            func.avg(Panne.criticite).label("avg_criticite"),
        )
        .join(Panne, Panne.machine_id == Machine.id)
    )
    if since:
        machines_q = machines_q.filter(Panne.created_at >= since)
    machines_pannes = machines_q.group_by(Machine.id).order_by(func.count(Panne.id).desc()).all()
    machines_heatmap = [
        {
            "machine_id": m.id,
            "machine_nom": m.nom,
            "panne_count": m.panne_count,
            "avg_criticite": round(m.avg_criticite, 1) if m.avg_criticite else 0,
        }
        for m in machines_pannes
    ]

    return {"zones": zone_data, "machines": machines_heatmap}


@router.get("/pieces-suggest")
def pieces_suggest(
    machine_id: int = Query(None),
    panne_titre: str = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Suggestion automatique de pièces basée sur les pannes similaires."""
    # Trouver les pannes similaires (même titre partiel ou même machine)
    similar_panne_ids = []

    if panne_titre:
        # Pannes dont le titre contient un mot clé du titre donné
        mots = [w for w in panne_titre.lower().split() if len(w) > 2]
        for mot in mots:
            rows = db.query(Panne.id).filter(Panne.titre.ilike(f"%{mot}%")).all()
            similar_panne_ids.extend(r[0] for r in rows)

    if machine_id:
        rows = db.query(Panne.id).filter(Panne.machine_id == machine_id).all()
        similar_panne_ids.extend(r[0] for r in rows)

    # Dédupliquer
    similar_panne_ids = list(set(similar_panne_ids))

    if not similar_panne_ids:
        return []

    # Trouver les pièces utilisées par ces pannes
    pieces = (
        db.query(
            Piece.id,
            Piece.reference,
            Piece.nom,
            func.sum(PannesPieces.quantite).label("fois_utilisee"),
        )
        .join(PannesPieces, PannesPieces.piece_id == Piece.id)
        .filter(PannesPieces.panne_id.in_(similar_panne_ids))
        .group_by(Piece.id)
        .order_by(func.sum(PannesPieces.quantite).desc())
        .limit(20)
        .all()
    )

    return [
        {"piece_id": p.id, "reference": p.reference, "nom": p.nom, "fois_utilisee": p.fois_utilisee}
        for p in pieces
    ]