"""Backend API → backend/app/api/bons_travail.py
   CRUD complet pour les Bons de Travail (Entretien / Nettoyage)
   Style BT TRIselec avec gammes, pièces, compteurs, visa
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from app.db.database import get_db
from app.models.bon_travail import BonTravail, BTGamme, BTPiece, BTCompteur, BTVisa
from app.schemas.bon_travail import (
    BonTravailCreate,
    BonTravailUpdate,
    BTGammeCreate,
    BTGammeUpdate,
    BTPieceCreate,
    BTCompteurCreate,
    BTVisaCreate,
)
from app.core.security import (
    get_current_user,
    require_manager_or_admin,
    require_admin,
    require_edit_access,
    require_signatory_role,
)
from app.core.activity import log_activity, apply_update_and_log
from app.services import bon_travail as svc_bt

router = APIRouter(prefix="/api/bons-travail", tags=["bons-travail"])


def _bt_to_list_item(bt: BonTravail) -> dict:
    """Convertit un BT en dict pour la vue liste."""
    demandeur_nom = bt.demandeur.username if bt.demandeur else None
    intervenant_nom = bt.intervenant.username if bt.intervenant else None
    machine_nom = None
    if bt.machine_id and hasattr(bt, "machine") and bt.machine:
        machine_nom = bt.machine.nom or bt.machine.code_interne
    return {
        "id": bt.id,
        "numero": bt.numero,
        "type_bt": bt.type_bt,
        "statut": bt.statut,
        "titre": bt.titre,
        "machine_id": bt.machine_id,
        "machine_nom": machine_nom,
        "degre_urgence": bt.degre_urgence,
        "date_creation": bt.date_creation,
        "date_debut_prevue": bt.date_debut_prevue,
        "date_cloture": bt.date_cloture,
        "demandeur_nom": demandeur_nom,
        "intervenant_nom": intervenant_nom,
        "gammes_total": len(bt.gammes),
        "gammes_faites": sum(1 for g in bt.gammes if g.completed),
    }


# ═══════════════════════════════════════════════════════════════
#  LISTE
# ═══════════════════════════════════════════════════════════════
@router.get("/")
def list_bons_travail(
    type_bt: str | None = None,
    statut: str | None = None,
    machine_id: int | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Liste des BT avec filtres. Si type_bt fourni, filtre sur entretien/nettoyage."""
    q = db.query(BonTravail).options(
        joinedload(BonTravail.gammes),
        joinedload(BonTravail.demandeur),
        joinedload(BonTravail.intervenant),
    )
    if type_bt:
        q = q.filter(BonTravail.type_bt == type_bt)
    if statut:
        q = q.filter(BonTravail.statut == statut)
    if machine_id:
        q = q.filter(BonTravail.machine_id == machine_id)
    if search:
        s = f"%{search}%"
        q = q.filter(
            BonTravail.titre.ilike(s) | BonTravail.numero.ilike(s) | BonTravail.description.ilike(s)
        )

    q = q.order_by(BonTravail.date_creation.desc())
    results = q.offset(skip).limit(limit).all()
    return [_bt_to_list_item(bt) for bt in results]


@router.get("/stats")
def get_stats(
    type_bt: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Stats pour le dashboard : nombre par statut."""
    q = db.query(BonTravail)
    if type_bt:
        q = q.filter(BonTravail.type_bt == type_bt)
    bts = q.all()
    stats = {"total": len(bts), "a_faire": 0, "en_cours": 0, "termine": 0, "cloture": 0}
    for bt in bts:
        key = bt.statut.replace(" ", "_").replace("é", "e").replace("ô", "o")
        if key in stats:
            stats[key] += 1
    return stats


# ═══════════════════════════════════════════════════════════════
#  DÉTAIL
# ═══════════════════════════════════════════════════════════════
@router.get("/{bt_id}")
def get_bon_travail(bt_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    bt = (
        db.query(BonTravail)
        .options(
            joinedload(BonTravail.gammes),
            joinedload(BonTravail.pieces),
            joinedload(BonTravail.compteurs),
            joinedload(BonTravail.visas),
            joinedload(BonTravail.demandeur),
            joinedload(BonTravail.intervenant),
        )
        .filter(BonTravail.id == bt_id)
        .first()
    )
    if not bt:
        raise HTTPException(status_code=404, detail="Bon de travail non trouvé")
    return bt


# ═══════════════════════════════════════════════════════════════
#  CRÉATION
# ═══════════════════════════════════════════════════════════════
@router.post("/")
def create_bon_travail(
    bt_in: BonTravailCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    if bt_in.type_bt not in ("entretien", "nettoyage"):
        raise HTTPException(status_code=400, detail="type_bt doit être 'entretien' ou 'nettoyage'")
    bt = svc_bt.create_bt(db, bt_in, current_user.id)
    log_activity(db, current_user, "créé", "bon_travail", bt.id, f"{bt.numero} - {bt.titre}")
    return bt


# ═══════════════════════════════════════════════════════════════
#  MISE À JOUR
# ═══════════════════════════════════════════════════════════════
@router.put("/{bt_id}")
def update_bon_travail(
    bt_id: int,
    bt_in: BonTravailUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Bon de travail non trouvé")

    apply_update_and_log(
        db,
        bt,
        bt_in.model_dump(exclude_unset=True),
        current_user,
        "bon_travail",
        label_fn=lambda b: b.titre,
        with_diff=False,
    )
    return bt


@router.delete("/{bt_id}")
def delete_bon_travail(
    bt_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Bon de travail non trouvé")
    label = f"{bt.numero} - {bt.titre}"
    db.delete(bt)
    db.commit()
    log_activity(db, current_user, "supprimé", "bon_travail", bt_id, label)
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  SOUS-RESSOURCES : Gammes
# ═══════════════════════════════════════════════════════════════
@router.post("/{bt_id}/gammes")
def add_gamme(
    bt_id: int,
    g_in: BTGammeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_edit_access),
):
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Bon de travail non trouvé")
    g = BTGamme(bt_id=bt_id, **g_in.model_dump())
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@router.put("/{bt_id}/gammes/{gamme_id}")
def update_gamme(
    bt_id: int,
    gamme_id: int,
    g_in: BTGammeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_edit_access),
):
    g = db.query(BTGamme).filter(BTGamme.id == gamme_id, BTGamme.bt_id == bt_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gamme non trouvée")
    for key, value in g_in.model_dump(exclude_unset=True).items():
        setattr(g, key, value)
    db.commit()
    db.refresh(g)
    return g


@router.delete("/{bt_id}/gammes/{gamme_id}")
def delete_gamme(
    bt_id: int,
    gamme_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    g = db.query(BTGamme).filter(BTGamme.id == gamme_id, BTGamme.bt_id == bt_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gamme non trouvée")
    db.delete(g)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  SOUS-RESSOURCES : Pièces
# ═══════════════════════════════════════════════════════════════
@router.post("/{bt_id}/pieces")
def add_piece(
    bt_id: int,
    p_in: BTPieceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_edit_access),
):
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Bon de travail non trouvé")
    cout_ligne = (p_in.cout_unitaire or 0) * (p_in.quantite or 1)
    p = BTPiece(bt_id=bt_id, cout_ligne=cout_ligne, **p_in.model_dump())
    db.add(p)
    bt.cout_total = svc_bt.recalculate_cout_total(bt) + cout_ligne
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{bt_id}/pieces/{piece_id}")
def delete_piece(
    bt_id: int,
    piece_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    p = db.query(BTPiece).filter(BTPiece.id == piece_id, BTPiece.bt_id == bt_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pièce non trouvée")
    db.delete(p)
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if bt:
        bt.cout_total = svc_bt.recalculate_cout_total(bt)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  SOUS-RESSOURCES : Compteurs
# ═══════════════════════════════════════════════════════════════
@router.post("/{bt_id}/compteurs")
def add_compteur(
    bt_id: int,
    c_in: BTCompteurCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_edit_access),
):
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Bon de travail non trouvé")
    c = BTCompteur(bt_id=bt_id, **c_in.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/{bt_id}/compteurs/{compteur_id}")
def update_compteur(
    bt_id: int,
    compteur_id: int,
    c_in: BTCompteurCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_edit_access),
):
    c = db.query(BTCompteur).filter(BTCompteur.id == compteur_id, BTCompteur.bt_id == bt_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Compteur non trouvé")
    for key, value in c_in.model_dump().items():
        setattr(c, key, value)
    db.commit()
    db.refresh(c)
    return c


# ═══════════════════════════════════════════════════════════════
#  SOUS-RESSOURCES : Visa
# ═══════════════════════════════════════════════════════════════
@router.post("/{bt_id}/visas")
def add_visa(
    bt_id: int,
    v_in: BTVisaCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_edit_access),
):
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Bon de travail non trouvé")
    require_signatory_role(current_user.role, v_in.role)
    v = BTVisa(bt_id=bt_id, date_visa=datetime.utcnow(), **v_in.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v
