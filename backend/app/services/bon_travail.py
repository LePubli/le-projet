"""Logique métier pour les Bons de Travail.

Fonctions sans dépendance FastAPI : appelables depuis l'API, les tests
unitaires ou d'autres services.
"""

from sqlalchemy.orm import Session
from app.models.bon_travail import BonTravail, BTGamme, BTCompteur
from app.schemas.bon_travail import BonTravailCreate


def generate_numero(db: Session, type_bt: str) -> str:
    """Génère un numéro de BT auto-incrémenté : BT-ENT-0001 ou BT-NET-0001."""
    prefix = "ENT" if type_bt == "entretien" else "NET"
    last = (
        db.query(BonTravail)
        .filter(BonTravail.numero.like(f"BT-{prefix}-%"))
        .order_by(BonTravail.id.desc())
        .first()
    )
    if last and last.numero:
        try:
            num = int(last.numero.split("-")[-1]) + 1
        except (ValueError, IndexError):
            num = 1
    else:
        num = 1
    return f"BT-{prefix}-{num:04d}"


def build_arborescence(machine) -> str:
    """Construit le chemin d'arborescence d'une machine (zone > ligne > code)."""
    parts = []
    if machine.zone:
        parts.append(f"Z-{machine.zone}")
    if machine.ligne:
        parts.append(machine.ligne)
    parts.append(machine.code_interne or machine.nom)
    return " > ".join(parts)


def create_bt(db: Session, bt_in: BonTravailCreate, current_user_id: int) -> BonTravail:
    """Crée un BT avec ses gammes et compteurs initiaux, retourne l'objet persisté."""
    numero = generate_numero(db, bt_in.type_bt)

    arborescence = None
    if bt_in.machine_id:
        from app.models.machine import Machine

        machine = db.query(Machine).filter(Machine.id == bt_in.machine_id).first()
        if machine:
            arborescence = build_arborescence(machine)

    bt = BonTravail(
        numero=numero,
        type_bt=bt_in.type_bt,
        titre=bt_in.titre,
        description=bt_in.description,
        machine_id=bt_in.machine_id,
        arborescence=arborescence,
        date_debut_prevue=bt_in.date_debut_prevue,
        date_fin_prevue=bt_in.date_fin_prevue,
        degre_urgence=bt_in.degre_urgence,
        famille=bt_in.famille,
        calendrier_id=bt_in.calendrier_id,
        demandeur_id=bt_in.demandeur_id or current_user_id,
        cause_medias=[m.model_dump() for m in bt_in.cause_medias] if bt_in.cause_medias else [],
        solution_medias=(
            [m.model_dump() for m in bt_in.solution_medias] if bt_in.solution_medias else []
        ),
    )
    db.add(bt)

    for g in bt_in.gammes:
        db.add(
            BTGamme(
                bt=bt,
                ordre=g.ordre,
                code_gamme=g.code_gamme,
                famille_gamme=g.famille_gamme,
                texte_gamme=g.texte_gamme,
                consignation=g.consignation,
                condamnation=g.condamnation,
                duree_estimee_h=g.duree_estimee_h,
            )
        )

    for c in bt_in.compteurs:
        db.add(
            BTCompteur(
                bt=bt,
                nom_compteur=c.nom_compteur,
                valeur=c.valeur,
                cumul=c.cumul,
                releve=c.releve,
                val_courante=c.val_courante,
            )
        )

    db.commit()
    db.refresh(bt)
    return bt


def recalculate_cout_total(bt: BonTravail) -> float:
    """Recalcule le coût total d'un BT à partir de ses pièces déjà persistées."""
    return sum((p.cout_ligne or 0) for p in bt.pieces)
