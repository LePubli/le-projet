"""Import / Export CSV pour toutes les entités principales.

Endpoints:
  GET  /api/import-export/{entity}/template      → télécharge un CSV exemple
  GET  /api/import-export/{entity}/export        → exporte toutes les données en CSV
  POST /api/import-export/{entity}/validate      → valide un CSV (dry-run) sans écrire
  POST /api/import-export/{entity}/import        → importe le CSV validé en base

Entités supportées:
  - machines
  - pannes
  - lignes  (regroupement de machines par ligne — dérivé)
  - bons-travail
  - entretien  (BT type=entretien)
  - nettoyage  (BT type=nettoyage)
"""
import csv
import io
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.machine import Machine
from app.models.panne import Panne
from app.models.bon_travail import BonTravail
from app.core.security import require_manager_or_admin

router = APIRouter(prefix="/api/import-export", tags=["import-export"])


# ─── Définitions des entités ────────────────────────────────────────────────
# Chaque entité a:
#   - columns: liste (colonne_csv, champ_model, is_required, description)
#   - model: modèle SQLAlchemy
#   - unique_keys: champs qui doivent être uniques (pour la déduplication)
ENTITY_DEFS: Dict[str, Dict[str, Any]] = {
    "machines": {
        "label": "Machines",
        "model": Machine,
        "columns": [
            ("nom", "nom", True, "Nom de la machine (obligatoire)"),
            ("code_interne", "code_interne", False, "Code interne unique (ex: L315). Laisser vide pour auto-générer."),
            ("site", "site", False, "Site géographique"),
            ("ligne", "ligne", False, "Ligne de production (ex: Ligne 1)"),
            ("zone", "zone", False, "Zone (ex: Triage, Compactage)"),
            ("etage", "etage", False, "Étage (0, 1 ou 2) — défaut 0"),
            ("fabricant", "fabricant", False, "Fabricant"),
            ("modele", "modele", False, "Modèle"),
            ("statut", "statut", False, "Statut: operationnel | en_panne | maintenance | arret"),
            ("notes", "notes", False, "Notes libres"),
            ("pos_x", "pos_x", False, "Position X sur schéma (décimal)"),
            ("pos_y", "pos_y", False, "Position Y sur schéma (décimal)"),
        ],
        "unique_keys": ["code_interne"],
        "defaults": {"etage": 0, "statut": "operationnel"},
    },
    "pannes": {
        "label": "Pannes",
        "model": Panne,
        "columns": [
            ("titre", "titre", True, "Titre de la panne (obligatoire)"),
            ("machine_code", None, True, "Code interne de la machine (ex: L315). Doit exister."),
            ("description", "description", False, "Description / symptôme"),
            ("criticite", "criticite", False, "Criticité 1-5 (défaut 3)"),
            ("cause_reelle", "cause_reelle", False, "Cause identifiée"),
            ("solution", "solution", False, "Solution appliquée"),
            ("causes_possibles", None, False, "Causes possibles séparées par | (ex: Usure|Surchauffe)"),
            ("temps_moyen_reparation", "temps_moyen_reparation", False, "Temps moyen de réparation en minutes"),
        ],
        "unique_keys": [],
        "defaults": {"criticite": 3},
        "fk_lookups": [("machine_code", "machine_id", Machine, "code_interne")],
    },
    "bons-travail": {
        "label": "Bons de Travail",
        "model": BonTravail,
        "columns": [
            ("titre", "titre", True, "Titre du BT (obligatoire)"),
            ("type_bt", "type_bt", False, "entretien | nettoyage (défaut entretien)"),
            ("machine_code", None, False, "Code interne de la machine (optionnel)"),
            ("description", "description", False, "Description"),
            ("degre_urgence", "degre_urgence", False, "basse | normale | haute | urgente"),
            ("famille", "famille", False, "Famille (ex: Crible à disque)"),
            ("statut", "statut", False, "à faire | en cours | terminé | clôturé"),
        ],
        "unique_keys": [],
        "defaults": {"type_bt": "entretien", "statut": "à faire", "degre_urgence": "normale"},
        "fk_lookups": [("machine_code", "machine_id", Machine, "code_interne")],
    },
    "entretien": {
        "label": "Entretien (BT)",
        "model": BonTravail,
        "columns": [
            ("titre", "titre", True, "Titre du BT d'entretien (obligatoire)"),
            ("machine_code", None, False, "Code interne de la machine"),
            ("description", "description", False, "Description"),
            ("degre_urgence", "degre_urgence", False, "basse | normale | haute | urgente"),
            ("famille", "famille", False, "Famille"),
            ("statut", "statut", False, "à faire | en cours | terminé | clôturé"),
        ],
        "unique_keys": [],
        "defaults": {"type_bt": "entretien", "statut": "à faire", "degre_urgence": "normale"},
        "fk_lookups": [("machine_code", "machine_id", Machine, "code_interne")],
        "filter": {"type_bt": "entretien"},
    },
    "nettoyage": {
        "label": "Nettoyage (BT)",
        "model": BonTravail,
        "columns": [
            ("titre", "titre", True, "Titre du BT de nettoyage (obligatoire)"),
            ("machine_code", None, False, "Code interne de la machine"),
            ("description", "description", False, "Description"),
            ("degre_urgence", "degre_urgence", False, "basse | normale | haute | urgente"),
            ("famille", "famille", False, "Famille"),
            ("statut", "statut", False, "à faire | en cours | terminé | clôturé"),
        ],
        "unique_keys": [],
        "defaults": {"type_bt": "nettoyage", "statut": "à faire", "degre_urgence": "normale"},
        "fk_lookups": [("machine_code", "machine_id", Machine, "code_interne")],
        "filter": {"type_bt": "nettoyage"},
    },
    "lignes": {
        "label": "Lignes & Process",
        "model": Machine,  # pas un vrai modèle — on exporte les lignes dérivées des machines
        "columns": [
            ("ligne", "ligne", True, "Nom de la ligne (obligatoire, ex: Ligne 1)"),
            ("site", "site", False, "Site"),
            ("nb_machines", None, False, "Nombre de machines sur cette ligne (calculé à l'export, ignoré à l'import)"),
        ],
        "unique_keys": ["ligne"],
        "is_aggregate": True,
    },
}


# ─── Helpers ────────────────────────────────────────────────────────────────
def _get_entity_def(entity: str) -> Dict[str, Any]:
    if entity not in ENTITY_DEFS:
        raise HTTPException(
            status_code=404,
            detail=f"Entité inconnue: {entity}. Valides: {sorted(ENTITY_DEFS.keys())}",
        )
    return ENTITY_DEFS[entity]


def _parse_value(raw: str, field_name: str, model_field) -> Any:
    """Convertit une string CSV en valeur Python selon le type du champ modèle."""
    if raw is None or raw.strip() == "":
        return None
    raw = raw.strip()
    # Détection du type via l'attribut python_type de SQLAlchemy
    try:
        ptype = model_field.property.columns[0].type.python_type
    except Exception:
        return raw
    if ptype is int:
        try:
            return int(raw)
        except ValueError:
            raise ValueError(f"'{raw}' n'est pas un entier valide pour '{field_name}'")
    if ptype is float:
        try:
            return float(raw)
        except ValueError:
            raise ValueError(f"'{raw}' n'est pas un nombre valide pour '{field_name}'")
    return raw


def _resolve_fk(raw: str, fk_col: str, fk_model, fk_lookup_col: str, db: Session) -> Optional[int]:
    """Résout une foreign key par lookup (ex: code_interne 'L315' → machine_id 42)."""
    if not raw or raw.strip() == "":
        return None
    obj = db.query(fk_model).filter(getattr(fk_model, fk_lookup_col) == raw.strip()).first()
    if not obj:
        raise ValueError(f"{fk_col} '{raw}' introuvable dans {fk_model.__tablename__}")
    return obj.id


# ─── Template (CSV exemple) ─────────────────────────────────────────────────
@router.get("/{entity}/template")
def download_template(entity: str):
    """Télécharge un fichier CSV exemple avec en-têtes + 2 lignes d'exemple."""
    edef = _get_entity_def(entity)
    headers = [c[0] for c in edef["columns"]]
    # 2 lignes d'exemple
    examples = _build_example_rows(entity, edef)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    # Ligne de commentaire avec descriptions (préfixée # — sera ignorée à l'import)
    writer.writerow([f"# {entity} — format d'import. Les lignes # sont ignorées."])
    writer.writerow(["#"] + [c[3] for c in edef["columns"]])
    writer.writerow(headers)
    for ex in examples:
        writer.writerow(ex)

    csv_bytes = output.getvalue().encode("utf-8-sig")  # BOM pour Excel français
    filename = f"template_{entity}_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_example_rows(entity: str, edef: Dict[str, Any]) -> List[List[str]]:
    """Génère 2 lignes d'exemple réalistes par entité."""
    if entity == "machines":
        return [
            ["Convoyeur d'entrée", "L315", "Triselec", "Ligne 1", "Triage", "0", "Skandik", "C-200", "operationnel", "", "42.5", "18.3"],
            ["Broyeur principal", "B540", "Triselec", "Ligne 1", "Compactage", "0", "Mehler", "B540", "operationnel", "Vérifier huile mensuel", "55.0", "22.0"],
        ]
    if entity == "pannes":
        return [
            ["Bruit anormal moteur", "L315", "Bruit métallique intermittent", "3", "Roulement usé", "Remplacement roulement", "Usure|Roulement|Manque lubrifiant", "45"],
            ["Surchauffe capteur", "B540", "Capteur à 95°C", "4", "Ventilation bloquée", "Nettoyage ventilateur", "Poussière|Ventilation", "30"],
        ]
    if entity in ("bons-travail", "entretien", "nettoyage"):
        type_bt = "entretien" if entity in ("bons-travail", "entretien") else "nettoyage"
        return [
            [f"BT {type_bt} hebdomadaire", type_bt, "L315", "Vérifier niveaux d'huile", "normale", "Convoyeur", "à faire"],
            [f"BT {type_bt} mensuel", type_bt, "B540", "Inspecter courroies", "basse", "Broyeur", "à faire"],
        ]
    if entity == "lignes":
        return [
            ["Ligne 1", "Triselec", "12"],
            ["Ligne 2", "Triselec", "8"],
        ]
    return [[]]


# ─── Export ─────────────────────────────────────────────────────────────────
@router.get("/{entity}/export")
def export_entity(
    entity: str,
    db: Session = Depends(get_db),
    _=Depends(require_manager_or_admin),
):
    """Exporte toutes les données de l'entité au format CSV."""
    edef = _get_entity_def(entity)
    headers = [c[0] for c in edef["columns"]]
    rows = _fetch_rows(entity, edef, db)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(headers)
    for r in rows:
        writer.writerow(r)

    csv_bytes = output.getvalue().encode("utf-8-sig")
    filename = f"export_{entity}_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _fetch_rows(entity: str, edef: Dict[str, Any], db: Session) -> List[List[str]]:
    """Récupère les données en DB et les met en forme pour le CSV."""
    if entity == "lignes":
        # Lignes = agrégat des machines groupées par 'ligne'
        machines = db.query(Machine).filter(Machine.ligne.isnot(None), Machine.ligne != "").all()
        by_line: Dict[str, Dict] = {}
        for m in machines:
            ln = m.ligne
            if ln not in by_line:
                by_line[ln] = {"ligne": ln, "site": m.site or "", "nb_machines": 0}
            by_line[ln]["nb_machines"] += 1
            if not by_line[ln]["site"] and m.site:
                by_line[ln]["site"] = m.site
        return [[d["ligne"], d["site"], str(d["nb_machines"])] for d in by_line.values()]

    model = edef["model"]
    q = db.query(model)
    if "filter" in edef:
        for k, v in edef["filter"].items():
            q = q.filter(getattr(model, k) == v)
    objs = q.all()

    rows = []
    for obj in objs:
        row = []
        for csv_col, model_col, *_ in edef["columns"]:
            if model_col is None:
                # Cas spécial: machine_code (FK résolue à l'envers)
                if csv_col == "machine_code":
                    mc = db.query(Machine).filter(Machine.id == obj.machine_id).first() if obj.machine_id else None
                    row.append(mc.code_interne if mc else "")
                else:
                    row.append("")
            else:
                val = getattr(obj, model_col, None)
                if isinstance(val, list):
                    val = "|".join(str(x) for x in val)
                row.append("" if val is None else str(val))
        rows.append(row)
    return rows


# ─── Validate (dry-run) ─────────────────────────────────────────────────────
class ValidationResult(BaseModel):
    valid: bool
    total_rows: int
    valid_rows: int
    error_rows: int
    errors: List[Dict[str, Any]]  # [{row: 5, column: "machine_code", message: "..."}]
    preview: List[Dict[str, Any]]  # 5 premières lignes mappées


@router.post("/{entity}/validate", response_model=ValidationResult)
async def validate_import(
    entity: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_manager_or_admin),
):
    """Valide un CSV sans écrire en base. Retourne erreurs + aperçu."""
    edef = _get_entity_def(entity)
    content = await file.read()
    rows, parse_errors = _parse_csv(content, edef)

    errors = list(parse_errors)
    valid_rows = 0
    preview: List[Dict[str, Any]] = []

    for i, row_data in enumerate(rows, start=2):  # start=2 car ligne 1 = en-têtes
        try:
            mapped = _map_row(row_data, edef, db, dry_run=True)
            if len(preview) < 5:
                preview.append({"row": i, "data": mapped})
            valid_rows += 1
        except ValueError as e:
            errors.append({"row": i, "column": "_", "message": str(e)})

    return ValidationResult(
        valid=len(errors) == 0,
        total_rows=len(rows),
        valid_rows=valid_rows,
        error_rows=len(errors),
        errors=errors[:100],  # limite à 100 erreurs affichées
        preview=preview,
    )


# ─── Import (définitif) ─────────────────────────────────────────────────────
class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: List[Dict[str, Any]]


@router.post("/{entity}/import", response_model=ImportResult)
async def import_entity(
    entity: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager_or_admin),
):
    """Importe le CSV en base. Les lignes en erreur sont ignorées (pas de rollback global)."""
    from app.core.activity import log_activity
    edef = _get_entity_def(entity)
    content = await file.read()
    rows, parse_errors = _parse_csv(content, edef)

    errors = list(parse_errors)
    imported = 0
    skipped = 0

    for i, row_data in enumerate(rows, start=2):
        try:
            mapped = _map_row(row_data, edef, db, dry_run=False)
            obj = _create_object(entity, edef, mapped, db)
            db.add(obj)
            db.flush()  # pour détecter les contraintes uniques
            imported += 1
        except ValueError as e:
            errors.append({"row": i, "column": "_", "message": str(e)})
            skipped += 1
            db.rollback()
        except Exception as e:
            db.rollback()
            errors.append({"row": i, "column": "_", "message": f"Erreur DB: {str(e)}"})
            skipped += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erreur commit: {str(e)}")

    log_activity(
        db, current_user, "importé", entity, None,
        f"{imported} ligne(s) importée(s), {skipped} ignorée(s)",
    )
    return ImportResult(imported=imported, skipped=skipped, errors=errors[:100])


# ─── Parsing CSV ────────────────────────────────────────────────────────────
def _parse_csv(content: bytes, edef: Dict[str, Any]) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
    """Parse le CSV. Ignore les lignes commençant par #. Retourne (rows, errors)."""
    text = content.decode("utf-8-sig")  # BOM-tolerant
    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows_raw = list(reader)
    errors: List[Dict[str, Any]] = []
    if not rows_raw:
        errors.append({"row": 0, "column": "_", "message": "Fichier vide"})
        return [], errors

    # Trouver la ligne d'en-têtes (première ligne ne commençant pas par #)
    header_idx = None
    for i, r in enumerate(rows_raw):
        if r and not r[0].startswith("#"):
            header_idx = i
            break
    if header_idx is None:
        errors.append({"row": 0, "column": "_", "message": "Aucune ligne d'en-têtes trouvée"})
        return [], errors

    headers = [h.strip() for h in rows_raw[header_idx]]
    expected_headers = [c[0] for c in edef["columns"]]
    # Vérifier que les en-têtes attendus sont présents
    for eh in expected_headers:
        if eh not in headers:
            errors.append({"row": header_idx + 1, "column": eh, "message": f"Colonne '{eh}' manquante"})

    # Mapper les lignes de données
    rows: List[Dict[str, str]] = []
    for r in rows_raw[header_idx + 1:]:
        if not r or (r[0] and r[0].startswith("#")):
            continue  # skip comments / empty lines
        if len(r) < len(headers):
            r = r + [""] * (len(headers) - len(r))  # pad
        row_dict = {headers[i]: (r[i] if i < len(r) else "").strip() for i in range(len(headers))}
        rows.append(row_dict)

    return rows, errors


def _map_row(row: Dict[str, str], edef: Dict[str, Any], db: Session, dry_run: bool) -> Dict[str, Any]:
    """Convertit une ligne CSV en dict de valeurs Python pour le modèle."""
    mapped: Dict[str, Any] = {}
    model = edef["model"]

    # 1. Champs directs
    for csv_col, model_col, required, _desc in edef["columns"]:
        if model_col is None:
            continue  # géré par FK lookups plus bas
        raw = row.get(csv_col, "")
        if required and (raw is None or raw.strip() == ""):
            raise ValueError(f"Champ obligatoire '{csv_col}' vide")

        # Cas spécial: causes_possibles (séparées par |)
        if csv_col == "causes_possibles" and raw:
            mapped[model_col] = [c.strip() for c in raw.split("|") if c.strip()]
            continue

        # Détection du type
        try:
            col_obj = getattr(model, model_col)
            val = _parse_value(raw, csv_col, col_obj) if raw else None
        except AttributeError:
            val = raw if raw else None
        except ValueError as e:
            raise ValueError(str(e))

        if val is None and csv_col in edef.get("defaults", {}):
            val = edef["defaults"][csv_col]
        mapped[model_col] = val

    # 2. FK lookups (ex: machine_code → machine_id)
    for csv_col, fk_col, fk_model, fk_lookup_col in edef.get("fk_lookups", []):
        raw = row.get(csv_col, "")
        if raw:
            mid = _resolve_fk(raw, csv_col, fk_model, fk_lookup_col, db)
            mapped[fk_col] = mid
        elif any(c[0] == csv_col and c[2] for c in edef["columns"]):
            raise ValueError(f"Champ obligatoire '{csv_col}' vide")
        else:
            mapped[fk_col] = None

    # 3. Defaults
    for k, v in edef.get("defaults", {}).items():
        if k not in mapped or mapped[k] is None:
            mapped[k] = v

    return mapped


def _create_object(entity: str, edef: Dict[str, Any], mapped: Dict[str, Any], db: Session):
    """Crée l'instance du modèle SQLAlchemy à partir du dict mappé."""
    if entity == "lignes":
        raise ValueError("L'import de lignes n'est pas supporté — modifiez le champ 'ligne' des machines à la place")

    model = edef["model"]

    # Pour les BT: générer un numéro auto si pas fourni
    if model is BonTravail:
        type_bt = mapped.get("type_bt", "entretien")
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
        mapped["numero"] = f"BT-{prefix}-{num:04d}"

    # Filtrer les champs qui existent réellement sur le modèle
    valid_fields = {c.name for c in model.__table__.columns}
    clean = {k: v for k, v in mapped.items() if k in valid_fields}
    return model(**clean)
