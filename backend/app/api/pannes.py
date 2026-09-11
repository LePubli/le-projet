from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.db.database import get_db
from app.models.panne import Panne
from app.models.intervention import Intervention
from app.models.piece import Piece, PannesPieces
from app.schemas.panne import PanneCreate, PanneUpdate, PanneOut
from app.core.security import get_current_user, require_manager_or_admin
from app.core.activity import log_activity, apply_update_and_log
from app.core.pagination import paginate
from app.services.panne_service import PanneService

router = APIRouter(prefix="/api/pannes", tags=["pannes"])


# ─── Schémas pour la vue détail ─────────────────────────────────────────────


class InterventionBrief(BaseModel):
    id: int
    technicien: str
    duree: Optional[int]
    commentaire: Optional[str]
    validee: bool
    validee_par: Optional[str]
    date_intervention: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class PieceUtilisee(BaseModel):
    piece_id: int
    nom: str
    reference: str
    quantite: int

    class Config:
        from_attributes = True


class PanneDetailOut(PanneOut):
    protocole_reparation: Optional[str] = None
    machine_nom: Optional[str] = None
    interventions_liees: List[InterventionBrief] = []
    pieces_detail: List[PieceUtilisee] = []


# ─── Routes ─────────────────────────────────────────────────────────────────


@router.get("/export/csv")
def export_pannes_csv(db: Session = Depends(get_db), _=Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    import csv
    import io

    pannes = db.query(Panne).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "machine_id",
            "titre",
            "criticite",
            "cause_reelle",
            "solution",
            "protocole_reparation",
            "temps_moyen_reparation",
            "created_at",
        ]
    )
    for p in pannes:
        writer.writerow(
            [
                p.id,
                p.machine_id,
                p.titre,
                p.criticite,
                p.cause_reelle,
                p.solution,
                p.protocole_reparation,
                p.temps_moyen_reparation,
                p.created_at,
            ]
        )
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.read().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pannes.csv"},
    )


@router.get("/")
def list_pannes(
    skip: int = 0,
    limit: int = 100,
    page: int | None = None,
    page_size: int | None = None,
    machine_id: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Liste paginée des pannes.

    Deux modes d'usage:
    - skip/limit (legacy) : GET /pannes/?skip=0&limit=50
    - page/page_size (recommandé) : GET /pannes/?page=1&page_size=50

    Quand page/page_size est fourni, retourne {items, total, page, page_size, total_pages}.
    Sinon (legacy), retourne juste la liste (rétro-compatibilité).
    """
    q = db.query(Panne)
    if machine_id:
        q = q.filter(Panne.machine_id == machine_id)

    return paginate(q, skip, limit, page, page_size, order_by=Panne.created_at.desc())


@router.get("/{panne_id}/detail", response_model=PanneDetailOut)
def get_panne_detail(panne_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne introuvable")

    interventions = (
        db.query(Intervention)
        .filter(Intervention.panne_id == panne_id)
        .order_by(Intervention.date_intervention.desc())
        .all()
    )

    pieces_detail = []
    for pp in panne.pieces_utilisees or []:
        if pp.piece:
            pieces_detail.append(
                PieceUtilisee(
                    piece_id=pp.piece_id,
                    nom=pp.piece.nom,
                    reference=pp.piece.reference,
                    quantite=pp.quantite,
                )
            )

    return PanneDetailOut(
        id=panne.id,
        machine_id=panne.machine_id,
        titre=panne.titre,
        description=panne.description,
        causes_possibles=panne.causes_possibles or [],
        cause_reelle=panne.cause_reelle,
        solution=panne.solution,
        protocole_reparation=panne.protocole_reparation,
        criticite=panne.criticite,
        temps_moyen_reparation=panne.temps_moyen_reparation,
        photos=panne.photos or [],
        cause_medias=panne.cause_medias or [],
        solution_medias=panne.solution_medias or [],
        created_at=panne.created_at,
        updated_at=panne.updated_at,
        machine_nom=panne.machine.nom if panne.machine else None,
        interventions_liees=[InterventionBrief.model_validate(i) for i in interventions],
        pieces_detail=pieces_detail,
    )


@router.get("/{panne_id}", response_model=PanneOut)
def get_panne(panne_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne not found")
    return panne


@router.post("/", response_model=PanneOut)
def create_panne(
    panne_in: PanneCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return PanneService.create(db, panne_in.model_dump(), current_user)


@router.put("/{panne_id}", response_model=PanneOut)
def update_panne(
    panne_id: int,
    panne_in: PanneUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne not found")
    apply_update_and_log(
        db,
        panne,
        panne_in.model_dump(exclude_unset=True),
        current_user,
        "panne",
        label_fn=lambda p: p.titre,
    )
    return panne


@router.delete("/{panne_id}")
def delete_panne(
    panne_id: int, db: Session = Depends(get_db), current_user=Depends(require_manager_or_admin)
):
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne not found")
    label = panne.titre
    db.delete(panne)
    db.commit()
    log_activity(db, current_user, "supprimé", "panne", panne_id, label)
    return {"ok": True}


# ─── Gestion des pièces associées ───────────────────────────────────────────


class PieceAssocIn(BaseModel):
    piece_id: int
    quantite: int = 1
    deduire_stock: bool = True


class PieceAssocOut(BaseModel):
    piece_id: int
    nom: str
    reference: str
    stock_apres: int
    quantite: int


@router.post("/{panne_id}/pieces", response_model=PieceAssocOut)
def ajouter_piece(
    panne_id: int,
    body: PieceAssocIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne introuvable")
    piece = db.query(Piece).filter(Piece.id == body.piece_id).first()
    if not piece:
        raise HTTPException(status_code=404, detail="Pièce introuvable")

    if body.deduire_stock:
        if piece.stock < body.quantite:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuffisant : {piece.stock} disponible(s), {body.quantite} demandé(s)",
            )
        piece.stock -= body.quantite

    existing = (
        db.query(PannesPieces)
        .filter(
            PannesPieces.panne_id == panne_id,
            PannesPieces.piece_id == body.piece_id,
        )
        .first()
    )

    if existing:
        existing.quantite += body.quantite
    else:
        assoc = PannesPieces(panne_id=panne_id, piece_id=body.piece_id, quantite=body.quantite)
        db.add(assoc)

    db.commit()
    db.refresh(piece)
    log_activity(
        db,
        current_user,
        "associé",
        "pièce",
        piece.id,
        f"{piece.nom} × {body.quantite} → panne #{panne_id}",
    )
    return PieceAssocOut(
        piece_id=piece.id,
        nom=piece.nom,
        reference=piece.reference,
        stock_apres=piece.stock,
        quantite=body.quantite,
    )


@router.delete("/{panne_id}/pieces/{piece_id}")
def retirer_piece(
    panne_id: int,
    piece_id: int,
    restaurer_stock: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assoc = (
        db.query(PannesPieces)
        .filter(
            PannesPieces.panne_id == panne_id,
            PannesPieces.piece_id == piece_id,
        )
        .first()
    )
    if not assoc:
        raise HTTPException(status_code=404, detail="Association introuvable")

    if restaurer_stock:
        piece = db.query(Piece).filter(Piece.id == piece_id).first()
        if piece:
            piece.stock += assoc.quantite
            log_activity(
                db,
                current_user,
                "restauré stock",
                "pièce",
                piece.id,
                f"{piece.nom} + {assoc.quantite} → stock",
            )

    db.delete(assoc)
    db.commit()
    log_activity(
        db, current_user, "retiré", "pièce", piece_id, f"pièce #{piece_id} ← panne #{panne_id}"
    )
    return {"ok": True}
