#!/usr/bin/env python3
"""Sauvegarde automatique de la base PostgreSQL TriMaint.

Usage:
  python backend/backup_db.py

À planifier en cron (tous les jours à 02:00 par exemple):
  0 2 * * * cd /app && python backup_db.py >> /var/log/trimaint-backup.log 2>&1

Le script:
  - Dump la DB via pg_dump (format custom = compressé + restaurable par pg_restore)
  - Sauvegarde dans data/backups/ avec nom daté
  - Rotation : garde les 30 derniers jours
  - Log structuré (peut être parsé par collecteur de logs)

Variables d'env requises:
  DATABASE_URL — URL PostgreSQL (postgresql://user:pass@host:port/dbname)
  BACKUP_RETENTION_DAYS — nombre de jours à conserver (défaut 30)
  BACKUP_DIR — dossier de sauvegarde (défaut data/backups/)
"""
import os
import sys
import subprocess
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

# Add backend to path for structlog
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.logging import configure_logging, get_logger

configure_logging()
log = get_logger("backup")


def parse_db_url(url: str) -> dict:
    """Parse DATABASE_URL en dict {user, password, host, port, dbname}."""
    p = urlparse(url)
    return {
        "user": p.username or "",
        "password": p.password or "",
        "host": p.hostname or "localhost",
        "port": str(p.port or 5432),
        "dbname": p.path.lstrip("/"),
    }


def run_backup() -> Path | None:
    """Exécute le pg_dump et retourne le chemin du fichier créé."""
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url or not db_url.startswith("postgresql"):
        log.error("backup_no_database_url")
        print("ERREUR: DATABASE_URL non défini ou non PostgreSQL", file=sys.stderr)
        return None

    backup_dir = Path(os.getenv("BACKUP_DIR", "data/backups"))
    backup_dir.mkdir(parents=True, exist_ok=True)

    retention_days = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))
    db = parse_db_url(db_url)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"trimaint_{db['dbname']}_{timestamp}.dump"

    # pg_dump en format custom (compressé, restaurable via pg_restore)
    env = os.environ.copy()
    env["PGPASSWORD"] = db["password"]

    cmd = [
        "pg_dump",
        "-Fc",  # format custom (compressé)
        "-Z", "6",  # niveau de compression (1-9, 6 = bon ratio)
        "-f", str(backup_file),
        "-h", db["host"],
        "-p", db["port"],
        "-U", db["user"],
        db["dbname"],
    ]

    log.info("backup_starting", db=db["dbname"], host=db["host"])
    start = datetime.now()

    try:
        result = subprocess.run(
            cmd, env=env, capture_output=True, text=True, timeout=600
        )
        duration = (datetime.now() - start).total_seconds()

        if result.returncode != 0:
            log.error(
                "backup_failed",
                db=db["dbname"],
                returncode=result.returncode,
                stderr=result.stderr[:500],
                duration_s=duration,
            )
            # Nettoyer le fichier partiel
            if backup_file.exists():
                backup_file.unlink()
            return None

        size_mb = backup_file.stat().st_size / (1024 * 1024)
        log.info(
            "backup_completed",
            db=db["dbname"],
            file=str(backup_file),
            size_mb=round(size_mb, 2),
            duration_s=round(duration, 1),
        )
        return backup_file

    except subprocess.TimeoutExpired:
        log.error("backup_timeout", db=db["dbname"], timeout_s=600)
        return None
    except FileNotFoundError:
        log.error("backup_pg_dump_not_found", hint="Installez postgresql-client dans le conteneur")
        return None
    except Exception as e:
        log.exception("backup_error", db=db["dbname"], error=str(e))
        return None


def rotate_old_backups() -> int:
    """Supprime les backups plus anciens que BACKUP_RETENTION_DAYS.
    Retourne le nombre de fichiers supprimés."""
    backup_dir = Path(os.getenv("BACKUP_DIR", "data/backups"))
    retention_days = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))
    cutoff = datetime.now() - timedelta(days=retention_days)

    deleted = 0
    if not backup_dir.exists():
        return 0

    for f in backup_dir.glob("*.dump"):
        try:
            mtime = datetime.fromtimestamp(f.stat().st_mtime)
            if mtime < cutoff:
                f.unlink()
                deleted += 1
                log.info("backup_rotated", file=str(f), age_days=(datetime.now() - mtime).days)
        except Exception as e:
            log.warning("backup_rotate_error", file=str(f), error=str(e))

    return deleted


def list_backups() -> list:
    """Liste les backups existants avec taille et date."""
    backup_dir = Path(os.getenv("BACKUP_DIR", "data/backups"))
    if not backup_dir.exists():
        return []
    backups = []
    for f in sorted(backup_dir.glob("*.dump"), reverse=True):
        st = f.stat()
        backups.append({
            "file": f.name,
            "size_mb": round(st.st_size / (1024 * 1024), 2),
            "date": datetime.fromtimestamp(st.st_mtime).isoformat(),
        })
    return backups


if __name__ == "__main__":
    print("=== TriMaint DB Backup ===")
    backup = run_backup()
    if backup:
        print(f"✓ Backup créé: {backup}")
    else:
        print("✗ Backup échoué", file=sys.stderr)
        sys.exit(1)
    deleted = rotate_old_backups()
    print(f"✓ Rotation: {deleted} vieux backup(s) supprimé(s)")
    remaining = list_backups()
    print(f"✓ {len(remaining)} backup(s) conservé(s):")
    for b in remaining[:5]:
        print(f"  - {b['file']} ({b['size_mb']} Mo, {b['date']})")
    if len(remaining) > 5:
        print(f"  ... et {len(remaining) - 5} autres")
