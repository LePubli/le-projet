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
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.security import require_manager_or_admin
from app.services.import_export import (
    EntiteInconnueError,
    build_example_rows,
    create_object,
    fetch_rows,
    get_entity_def,
    map_row,
    parse_csv,
)

router = APIRouter(prefix="/api/import-export", tags=["import-export"])


def _get_entity_def(entity: str) -> Dict[str, Any]:
    """Traduit une entité inconnue en 404 HTTP."""
    try:
        return get_entity_def(entity)
    except EntiteInconnueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Template (CSV exemple) ─────────────────────────────────────────────────
@router.get("/{entity}/template")
def download_template(entity: str):
    """Télécharge un fichier CSV exemple avec en-têtes + 2 lignes d'exemple."""
    edef = _get_entity_def(entity)
    headers = [c[0] for c in edef["columns"]]
    # 2 lignes d'exemple
    examples = build_example_rows(entity)

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
    rows = fetch_rows(entity, edef, db)

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
    rows, parse_errors = parse_csv(content, edef)

    errors = list(parse_errors)
    valid_rows = 0
    preview: List[Dict[str, Any]] = []

    for i, row_data in enumerate(rows, start=2):  # start=2 car ligne 1 = en-têtes
        try:
            mapped = map_row(row_data, edef, db)
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
    rows, parse_errors = parse_csv(content, edef)

    errors = list(parse_errors)
    imported = 0
    skipped = 0

    for i, row_data in enumerate(rows, start=2):
        try:
            mapped = map_row(row_data, edef, db)
            obj = create_object(entity, edef, mapped, db)
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
        db,
        current_user,
        "importé",
        entity,
        None,
        f"{imported} ligne(s) importée(s), {skipped} ignorée(s)",
    )
    return ImportResult(imported=imported, skipped=skipped, errors=errors[:100])
