"""Sécurité : hashing mots de passe, JWT, dépendances d'authentification."""

from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ---------------------------------------------------------------------------
# Mots de passe (bcrypt)
# ---------------------------------------------------------------------------


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe contre son hash bcrypt."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


def get_password_hash(password: str) -> str:
    """Hash un mot de passe avec bcrypt.

    Lève une erreur si le mot de passe dépasse 72 octets (limite bcrypt).
    """
    pw_bytes = password.encode("utf-8")
    if len(pw_bytes) > 72:
        raise ValueError("Le mot de passe dépasse la limite de 72 octets de bcrypt")
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt(rounds=12)).decode("utf-8")


# ---------------------------------------------------------------------------
# JWT (pyjwt)
# ---------------------------------------------------------------------------


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crée un token JWT signé."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update(
        {
            "exp": expire,
            "iat": now,
            "nbf": now,
        }
    )
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Décode et vérifie un token JWT. Lève JWTError si invalide."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ---------------------------------------------------------------------------
# Dépendances FastAPI
# ---------------------------------------------------------------------------


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Récupère l'utilisateur courant à partir du token JWT."""
    from app.models.user import User

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Compte désactivé",
        )
    return user


def require_admin(current_user=Depends(get_current_user)):
    """Exige le rôle admin."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès administrateur requis")
    return current_user


def require_manager_or_admin(current_user=Depends(get_current_user)):
    """Exige le rôle manager, chef_equipe ou admin."""
    if current_user.role not in ("admin", "chef_equipe"):
        raise HTTPException(status_code=403, detail="Accès manager ou administrateur requis")
    return current_user


def require_edit_access(current_user=Depends(get_current_user)):
    """Exige un rôle avec accès en écriture (admin, manager, chef_equipe, technicien).
    Le rôle 'lecteur' n'a accès qu'en lecture (GET)."""
    if current_user.role == "lecteur":
        raise HTTPException(status_code=403, detail="Accès en lecture uniquement")
    return current_user
