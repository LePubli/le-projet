"""Configuration centrale de l'application.

Toutes les variables sensibles DOIVENT être fournies via les variables
d'environnement. Aucune valeur par défaut n'est codée en dur pour les
secrets (SECRET_KEY, mots de passe).
"""
import os
import sys
from typing import List


def _get_required_env(name: str, test_default: str = "") -> str:
    """Récupère une variable d'environnement obligatoire.

    En production, fait échouer le démarrage si la variable est absente
    ou vide. En mode test (env TEST_MODE=1), retourne une valeur
    factice pour permettre l'exécution des tests sans configuration.
    """
    value = os.getenv(name, "").strip()
    if not value:
        if os.getenv("TEST_MODE") == "1":
            return test_default
        print(
            f"ERREUR FATALE: La variable d'environnement {name} est obligatoire.\n"
            f"Définissez-la dans votre fichier .env avant de démarrer l'application.",
            file=sys.stderr,
        )
        sys.exit(1)
    return value


# --- Sécurité / JWT ---------------------------------------------------------
SECRET_KEY: str = _get_required_env("SECRET_KEY", "test-secret-key-for-unit-tests-only-64chars")
ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8h

# CORS : liste d'origines séparées par des virgules
# Exemple : https://trimaint.triselec.fr,http://localhost:5000
_default_cors = "http://localhost:5000,http://localhost:3000"
ALLOWED_ORIGINS: List[str] = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_cors).split(",") if o.strip()
]

# Rate limiting
LOGIN_RATE_LIMIT: str = os.getenv("LOGIN_RATE_LIMIT", "5/minute")
DEFAULT_RATE_LIMIT: str = os.getenv("DEFAULT_RATE_LIMIT", "100/minute")

# Bootstrap admin (désactivé par défaut pour la prod)
# Mettre BOOTSTRAP_ADMIN=1 pour créer un admin initial au premier démarrage
BOOTSTRAP_ADMIN: bool = os.getenv("BOOTSTRAP_ADMIN", "0") == "1"
BOOTSTRAP_ADMIN_PASSWORD: str = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")

# --- Base de données --------------------------------------------------------
DATABASE_URL: str = _get_required_env(
    "DATABASE_URL",
    "sqlite:////tmp/test_trimaint.db",  # SQLite pour tests unitaires
)

# --- Uploads ---------------------------------------------------------------
_default_upload = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "uploads",
)
UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", _default_upload)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Taille max upload (50 Mo par défaut — permet les courtes vidéos de diagnostic)
MAX_UPLOAD_SIZE: int = int(os.getenv("MAX_UPLOAD_SIZE", str(50 * 1024 * 1024)))

# --- Web Push (VAPID keys) --------------------------------------------------
# Générer avec : python -c "from pywebpush import webpush; from py_vapid import Vapid; v = Vapid(); v.generate_keys('private_key.pem'); print(v.generate_vapid_keys())"
# Ou utiliser : npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY: str = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CLAIM_EMAIL: str = os.getenv("VAPID_CLAIM_EMAIL", "admin@trimaint.local")
