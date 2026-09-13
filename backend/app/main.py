"""Point d'entrée FastAPI de l'application TriMaint."""

import os
import shutil
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from app.db.database import get_db
from app.core.config import ALLOWED_ORIGINS, BOOTSTRAP_ADMIN, BOOTSTRAP_ADMIN_PASSWORD, UPLOAD_DIR
from app.core.logging import configure_logging, get_logger

# Configure structlog avant toute chose
configure_logging()
log = get_logger(__name__)

# Rate limiter global — DOIT être défini avant l'import des routers ci-dessous :
# app/api/auth.py fait `from app.main import limiter` à son propre import, donc
# l'attribut doit déjà exister sur ce module à ce moment précis. Sinon, import
# circulaire silencieux et le rate-limit du login ne s'applique jamais — c'était
# le cas avant ce correctif (le rate-limit du login n'a jamais été actif).
# Désactivé en TEST_MODE : la suite de tests dépasse largement 5 logins/minute.
limiter = Limiter(key_func=get_remote_address, enabled=os.getenv("TEST_MODE") != "1")

from app.api import (  # noqa: E402
    auth,
    machines,
    pannes,
    interventions,
    pieces,
    search,
    stats,
    uploads,
    admin,
    notifications,
    maintenance_preventive,
    convoyeurs,
    base_connaissances,
    kpi,
    checklists,
    bons_travail,
    import_export,
    saved_filters,
    push,
    public_api,
    extra,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Cycle de vie de l'application.

    Crée un utilisateur admin initial UNIQUEMENT si BOOTSTRAP_ADMIN=1
    et si aucun utilisateur admin n'existe encore. Le mot de passe doit
    être fourni via BOOTSTRAP_ADMIN_PASSWORD.
    """
    log.info("app_starting", version=app.version)
    if BOOTSTRAP_ADMIN:
        from app.db.database import SessionLocal
        from app.models.user import User
        from app.core.security import get_password_hash

        db = SessionLocal()
        try:
            existing = db.query(User).filter(User.username == "admin").first()
            if not existing:
                if not BOOTSTRAP_ADMIN_PASSWORD or len(BOOTSTRAP_ADMIN_PASSWORD) < 8:
                    log.error("bootstrap_admin_password_missing")
                    print(
                        "ERREUR: BOOTSTRAP_ADMIN=1 mais BOOTSTRAP_ADMIN_PASSWORD "
                        "est absent ou trop court (min 8 caractères).",
                        flush=True,
                    )
                else:
                    admin_user = User(
                        username="admin",
                        email=os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com"),
                        hashed_password=get_password_hash(BOOTSTRAP_ADMIN_PASSWORD),
                        role="admin",
                        is_active=True,
                    )
                    db.add(admin_user)
                    db.commit()
                    log.info("bootstrap_admin_created", email=admin_user.email)
                    print(
                        "Utilisateur admin initial créé. "
                        "CHANGEZ LE MOT DE PASSE IMMÉDIATEMENT via l'interface.",
                        flush=True,
                    )
        finally:
            db.close()
    log.info("app_ready")
    yield
    log.info("app_stopping")


app = FastAPI(
    title="TriMaint API",
    description="GMAO pour Triselec",
    version="1.3.0",
    lifespan=lifespan,
)

# Rate limiting state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS restrictif : origins explicites uniquement
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    max_age=600,
)

# Middleware de logging des requêtes HTTP
import time as _time  # noqa: E402
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402
from starlette.requests import Request as _Req  # noqa: E402


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log chaque requête HTTP avec méthode, path, status, durée."""

    async def dispatch(self, request: _Req, call_next):
        # Skip healthcheck spam (polled every 30s by Docker)
        if request.url.path == "/api/health":
            return await call_next(request)
        start = _time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        except Exception:
            log.exception(
                "request_error",
                method=request.method,
                path=request.url.path,
            )
            raise
        finally:
            duration_ms = round((_time.perf_counter() - start) * 1000, 1)
            log.info(
                "request",
                method=request.method,
                path=request.url.path,
                status=status,
                duration_ms=duration_ms,
            )


app.add_middleware(RequestLoggingMiddleware)

# Routers
app.include_router(auth.router)
app.include_router(machines.router)
app.include_router(pannes.router)
app.include_router(interventions.router)
app.include_router(pieces.router)
app.include_router(search.router)
app.include_router(stats.router)
app.include_router(uploads.router)
app.include_router(admin.router)
app.include_router(notifications.router)
app.include_router(maintenance_preventive.router)
app.include_router(convoyeurs.router)
app.include_router(base_connaissances.router)
app.include_router(kpi.router)
app.include_router(checklists.router)
app.include_router(bons_travail.router)
app.include_router(import_export.router)
app.include_router(saved_filters.router)
app.include_router(push.router)
app.include_router(public_api.admin_router)
app.include_router(public_api.public_router)
app.include_router(extra.router)


@app.get("/api/health", tags=["health"])
def health(db: Session = Depends(get_db)):
    """Endpoint de santé enrichi pour healthchecks Docker et monitoring.

    Vérifie : DB, espace disque uploads, version. Ne nécessite pas d'auth.
    """
    import psutil
    from sqlalchemy import text

    health_data = {
        "status": "ok",
        "service": "TriMaint API",
        "version": "1.6.0",
    }

    # Check DB
    try:
        db.execute(text("SELECT 1"))
        health_data["db"] = "ok"
    except Exception as e:
        health_data["status"] = "degraded"
        health_data["db"] = f"error: {str(e)[:100]}"
        log.warning("healthcheck_db_failed", error=str(e)[:200])

    # Disk usage on UPLOAD_DIR
    try:
        upload_usage = shutil.disk_usage(UPLOAD_DIR)
        # Count files in upload dir
        upload_files = (
            sum(1 for _ in os.scandir(UPLOAD_DIR) if _.is_file())
            if os.path.isdir(UPLOAD_DIR)
            else 0
        )
        health_data["uploads"] = {
            "disk_free_gb": round(upload_usage.free / (1024**3), 2),
            "disk_total_gb": round(upload_usage.total / (1024**3), 2),
            "files_count": upload_files,
        }
    except Exception as e:
        health_data["uploads"] = f"error: {str(e)[:100]}"

    # System metrics
    try:
        health_data["system"] = {
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory_percent": psutil.virtual_memory().percent,
            "load_avg_1m": os.getloadavg()[0] if hasattr(os, "getloadavg") else None,
        }
    except Exception:
        pass

    log.info("healthcheck", status=health_data["status"])
    return health_data
