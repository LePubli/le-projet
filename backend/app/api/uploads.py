"""Upload de fichiers avec validation MIME par magic bytes.

Sécurité
--------
- L'upload (POST) reste protégé par JWT (`get_current_user`).
- Le téléchargement (GET) est PUBLIC : les fichiers sont servis par UUID
  (non-énumérables), validés contre le path traversal, et le rendu `<img src>`
  / `<video src>` côté navigateur ne peut pas joindre le header Authorization.
  Exiger un JWT sur le GET cassait donc l'affichage des médias dans le
  frontend. On garde une protection contre le hot-linking externe via
  Referer/Origin check optionnel (UPLOAD_ALLOW_HOTLINK=1 pour désactiver).
"""
import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse
import aiofiles
from app.core.config import UPLOAD_DIR, MAX_UPLOAD_SIZE
from app.core.security import get_current_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Extension -> magic bytes signatures (premiers octets)
# Vidéos ajoutées en v1.4 pour cause/solution des pannes et base de connaissances.
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".webp", ".mp4", ".webm", ".mov"}

MIME_SIGNATURES = {
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".gif": [b"GIF87a", b"GIF89a"],
    ".pdf": [b"%PDF"],
    ".webp": [b"RIFF"],  # RIFF....WEBP
    # Vidéos : MP4 (ftyp), WebM (1A 45 DF A3), MOV/QuickTime (ftypqt ou mdat/free)
    ".mp4": [b"\x00\x00\x00\x18ftyp", b"\x00\x00\x00\x20ftyp", b"\x00\x00\x00\x1cftyp"],
    ".webm": [b"\x1a\x45\xdf\xa3"],
    ".mov": [b"\x00\x00\x00\x14ftypqt", b"\x00\x00\x00\x18ftypqt", b"\x00\x00\x00\x1cftypqt", b"\x00\x00\x00\x20ftypqt"],
}

# MIME types pour les en-têtes de réponse
MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}

# Type logique pour le frontend (image vs video) — dérivé de l'extension
MEDIA_KIND = {
    ".jpg": "image", ".jpeg": "image", ".png": "image",
    ".gif": "image", ".webp": "image",
    ".mp4": "video", ".webm": "video", ".mov": "video",
}


def _validate_magic_bytes(content: bytes, ext: str) -> bool:
    """Vérifie que le contenu correspond à l'extension déclarée via magic bytes."""
    signatures = MIME_SIGNATURES.get(ext, [])
    if not signatures:
        return False
    for sig in signatures:
        if content.startswith(sig):
            # Cas spécial WEBP : vérifier aussi "WEBP" à l'offset 8
            if ext == ".webp" and len(content) >= 12:
                return content[8:12] == b"WEBP"
            return True
    return False


@router.post("/")
async def upload_file(file: UploadFile = File(...), _=Depends(get_current_user)):
    """Upload un fichier avec validation stricte :
    - extension autorisée
    - taille <= MAX_UPLOAD_SIZE
    - magic bytes correspondant à l'extension

    Retourne `{filename, url, kind}` où `kind` vaut `"image"` ou `"video"`.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Type de fichier non autorisé. Autorisés : {sorted(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Fichier trop volumineux (max {MAX_UPLOAD_SIZE // (1024 * 1024)} Mo)",
        )

    if not _validate_magic_bytes(content, ext):
        raise HTTPException(
            status_code=400,
            detail="Le contenu du fichier ne correspond pas à son extension (validation magic bytes échouée)",
        )

    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)

    original_name = os.path.basename(file.filename or filename)
    return {
        "filename": filename,
        "url": f"/api/uploads/{filename}",
        "kind": MEDIA_KIND.get(ext, "file"),
        "name": original_name,
    }


@router.get("/{filename}")
async def get_file(filename: str, request: Request):
    """Télécharge un fichier uploadé (PUBLIC, protégé contre path traversal).

    PUBLIC car les <img src> / <video src> du navigateur ne joignent pas
    automatiquement le header Authorization. Les fichiers sont des UUID
    non-énumérables, donc le risque d'énumération est nul.

    Protection hot-link : si l'env UPLOAD_ALLOW_HOTLINK != "1", on vérifie que
    le Referer/Origin vient du même domaine (évite le hot-linking depuis un
    site externe). Les clients directs (curl sans Referer) sont autorisés.
    """
    # Sécurité : nom de fichier simple uniquement
    safe_name = os.path.basename(filename)
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    filepath = os.path.join(UPLOAD_DIR, safe_name)
    safe_path = os.path.realpath(filepath)
    safe_dir = os.path.realpath(UPLOAD_DIR)
    if not safe_path.startswith(safe_dir + os.sep):
        raise HTTPException(status_code=403, detail="Accès refusé")

    if not os.path.exists(filepath) or not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Fichier introuvable")

    # Anti-hot-link optionnel (sauf si UPLOAD_ALLOW_HOTLINK=1)
    if os.getenv("UPLOAD_ALLOW_HOTLINK", "0") != "1":
        referer = request.headers.get("referer", "")
        origin = request.headers.get("origin", "")
        host = request.headers.get("host", "")
        from urllib.parse import urlparse
        for url in (referer, origin):
            if not url:
                continue
            try:
                ref_host = urlparse(url).netloc
                if ref_host and host and ref_host != host:
                    raise HTTPException(status_code=403, detail="Hot-linking non autorisé")
            except ValueError:
                pass  # Malformed URL — be permissive

    ext = os.path.splitext(safe_name)[1].lower()
    media_type = MIME_TYPES.get(ext, "application/octet-stream")
    return FileResponse(
        filepath,
        media_type=media_type,
        filename=safe_name,
    )
