from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.machine import Machine
from app.models.convoyeur import Convoyeur
from app.schemas.machine import MachineCreate, MachineUpdate, MachineOut
from pydantic import BaseModel
from app.core.security import get_current_user, require_manager_or_admin, require_admin
from app.core.activity import log_activity, apply_update_and_log

router = APIRouter(prefix="/api/machines", tags=["machines"])


@router.get("/", response_model=list[MachineOut])
def list_machines(
    skip: int = 0,
    limit: int = 500,
    page: int | None = None,
    page_size: int | None = None,
    ligne: str | None = None,
    zone: str | None = None,
    etage: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Liste paginée des machines. Voir pannes.list_pannes pour le format page/page_size."""
    q = db.query(Machine)
    if ligne:
        q = q.filter(Machine.ligne == ligne)
    if zone:
        q = q.filter(Machine.zone == zone)
    if etage is not None:
        q = q.filter(Machine.etage == etage)
    return q.offset(skip).limit(limit).all()


@router.get("/schema-data")
def get_schema_data(
    ligne: str | None = None,
    etage: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Retourne toutes les données nécessaires pour le schéma interactif :
    machines avec positions, convoyeurs avec chemins, et la liste des zones/étages."""
    # Machines
    q_machines = db.query(Machine)
    if ligne:
        q_machines = q_machines.filter(Machine.ligne == ligne)
    if etage is not None:
        q_machines = q_machines.filter(Machine.etage == etage)
    machines = q_machines.all()

    # Convoyeurs
    q_conv = db.query(Convoyeur)
    if ligne:
        q_conv = q_conv.filter(Convoyeur.ligne == ligne)
    if etage is not None:
        q_conv = q_conv.filter(Convoyeur.etage == etage)
    convoyeurs = q_conv.all()

    # Collect unique zones and etages
    zones = sorted(set(m.zone for m in machines if m.zone))
    etages = sorted(set(m.etage for m in machines if m.etage is not None))
    lignes = sorted(set(m.ligne for m in machines if m.ligne))

    return {
        "machines": [
            {
                "id": m.id,
                "nom": m.nom,
                "code_interne": m.code_interne,
                "statut": m.statut,
                "zone": m.zone,
                "etage": m.etage,
                "ligne": m.ligne,
                "pos_x": m.pos_x,
                "pos_y": m.pos_y,
                "couleur": m.couleur,
                "taille_pastille": m.taille_pastille,
                "rotation": m.rotation,
                "type": "machine",
            }
            for m in machines
        ],
        "convoyeurs": [
            {
                "id": c.id,
                "nom": c.nom,
                "code_interne": c.code_interne,
                "statut": c.statut,
                "zone": c.zone,
                "etage": c.etage,
                "type_convoyeur": c.type_convoyeur,
                "source_machine_id": c.source_machine_id,
                "target_machine_id": c.target_machine_id,
                "path_points": c.path_points or [],
                "type": "convoyeur",
            }
            for c in convoyeurs
        ],
        "zones": zones,
        "etages": etages,
        "lignes": lignes,
    }


@router.get("/meta/sites")
def list_sites(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Liste des sites distincts (pour le sélecteur multi-sites)."""
    from sqlalchemy import distinct

    sites = (
        db.query(distinct(Machine.site)).filter(Machine.site.isnot(None), Machine.site != "").all()
    )
    return sorted([s[0] for s in sites])


@router.get("/meta/lignes")
def list_lignes(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Regroupe les machines par ligne et zone, pour la vue process/schéma."""
    machines = db.query(Machine).filter(Machine.ligne.isnot(None), Machine.ligne != "").all()
    lignes: dict[str, dict] = {}
    for m in machines:
        ligne_data = lignes.setdefault(
            m.ligne, {"ligne": m.ligne, "site": m.site, "zones": {}, "total": 0, "en_panne": 0}
        )
        ligne_data["total"] += 1
        if m.statut == "en_panne":
            ligne_data["en_panne"] += 1
        zone_key = m.zone or "Sans zone"
        zone_data = ligne_data["zones"].setdefault(zone_key, {"zone": zone_key, "count": 0})
        zone_data["count"] += 1
    result = []
    for ligne in lignes.values():
        ligne["zones"] = list(ligne["zones"].values())
        result.append(ligne)
    return result


class LigneRenameBody(BaseModel):
    ancien_nom: str
    nouveau_nom: str


class LigneDeleteBody(BaseModel):
    nom: str


@router.post("/meta/lignes")
def rename_ligne(
    body: LigneRenameBody,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    """Renommer une ligne de production (met à jour le champ ligne de toutes les machines concernées)."""
    ancien = body.ancien_nom.strip()
    nouveau = body.nouveau_nom.strip()

    if not ancien:
        return {"ok": True, "affected": 0}

    if ancien == nouveau:
        return {"ok": True, "affected": 0}

    count = (
        db.query(Machine)
        .filter(Machine.ligne == ancien)
        .update({"ligne": nouveau}, synchronize_session="fetch")
    )
    db.commit()
    log_activity(db, current_user, "renommé", "ligne", None, f"{ancien} → {nouveau}")
    return {"ok": True, "affected": count}


@router.delete("/meta/lignes")
def delete_ligne(
    body: LigneDeleteBody,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Supprimer une ligne de production (met ligne à NULL sur toutes les machines concernées)."""
    nom = body.nom.strip()
    if not nom:
        raise HTTPException(status_code=400, detail="Le nom de la ligne est requis")

    count = (
        db.query(Machine)
        .filter(Machine.ligne == nom)
        .update({"ligne": None}, synchronize_session="fetch")
    )
    db.commit()
    log_activity(db, current_user, "supprimé", "ligne", None, nom)
    return {"ok": True, "affected": count}


@router.get("/bulk", response_model=list[MachineOut])
def bulk_machines(ids: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Fetch multiple machines by comma-separated IDs for schema."""
    id_list = [int(x.strip()) for x in ids.split(",") if x.strip().isdigit()]
    return db.query(Machine).filter(Machine.id.in_(id_list)).all()


@router.get("/by-code/{code}")
def get_machine_by_code(code: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Lookup machine par code_interne — utilisé par le scanner QR code mobile."""
    machine = db.query(Machine).filter(Machine.code_interne == code).first()
    if not machine:
        raise HTTPException(status_code=404, detail=f"Aucune machine avec le code '{code}'")
    return {"id": machine.id, "nom": machine.nom, "code_interne": machine.code_interne}


@router.get("/{machine_id}/qr-code")
def get_qr_code(machine_id: int, db: Session = Depends(get_db)):
    """Génère un QR code SVG contenant le code_interne de la machine.
    Endpoint PUBLIC (pas d'auth). Génère le SVG manuellement à partir de la
    matrice QR — pas besoin de Pillow ni du module SVG de qrcode."""
    import qrcode as _qrcode
    from fastapi.responses import Response as _Response

    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    code = machine.code_interne or str(machine.id)

    # Générer la matrice QR (sans rendu image)
    qr = _qrcode.QRCode(
        version=None,
        error_correction=_qrcode.constants.ERROR_CORRECT_M,
        box_size=1,
        border=4,
    )
    qr.add_data(code)
    qr.make(fit=True)
    matrix = qr.get_matrix()

    # Générer le SVG manuellement : un <rect> noir par case True
    size = len(matrix)
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'style="background:white;width:100%;height:auto;">'
    ]
    for y, row in enumerate(matrix):
        for x, cell in enumerate(row):
            if cell:
                svg_parts.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="black"/>')
    svg_parts.append("</svg>")
    svg_str = "".join(svg_parts)

    return _Response(
        content=svg_str,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/{machine_id}", response_model=MachineOut)
def get_machine(machine_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine


@router.post("/", response_model=MachineOut)
def create_machine(
    machine_in: MachineCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    machine = Machine(**machine_in.model_dump())
    db.add(machine)
    db.commit()
    db.refresh(machine)
    log_activity(db, current_user, "créé", "machine", machine.id, machine.nom)
    return machine


@router.put("/{machine_id}", response_model=MachineOut)
def update_machine(
    machine_id: int,
    machine_in: MachineUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    apply_update_and_log(
        db,
        machine,
        machine_in.model_dump(exclude_unset=True),
        current_user,
        "machine",
        label_fn=lambda m: m.nom,
        with_diff=False,
    )
    return machine


@router.delete("/{machine_id}")
def delete_machine(
    machine_id: int, db: Session = Depends(get_db), current_user=Depends(require_manager_or_admin)
):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    label = machine.nom
    db.delete(machine)
    db.commit()
    log_activity(db, current_user, "supprimé", "machine", machine_id, label)
    return {"ok": True}
