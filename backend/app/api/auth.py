from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel, Field
from typing import Optional
from app.db.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, Token
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    require_admin,
)
from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, LOGIN_RATE_LIMIT
from app.core.activity import log_activity
from app.main import limiter

# Rate limiting sur le login (slowapi) — désactivé en TEST_MODE (voir app.main.limiter)
_rate_decorator = limiter.limit(LOGIN_RATE_LIMIT)


router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    email: Optional[str] = None


class PasswordReset(BaseModel):
    new_password: str = Field(
        ..., min_length=8, max_length=72, description="Mot de passe (8-72 caractères)"
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@router.post("/login", response_model=Token)
@_rate_decorator
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authentification OAuth2 password flow avec rate limiting.

    Limitation : 5 tentatives par minute par IP (configurable via LOGIN_RATE_LIMIT).
    """
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte désactivé")
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    log_activity(db, user, "connexion", "session", user.id, user.username)
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def get_me(current_user=Depends(get_current_user)):
    return current_user


# ---------------------------------------------------------------------------
# Gestion des utilisateurs (admin)
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(User).order_by(User.id).all()


@router.post("/users", response_model=UserOut)
def create_user(
    user_in: UserCreate, db: Session = Depends(get_db), current_user=Depends(require_admin)
):
    existing = (
        db.query(User)
        .filter((User.username == user_in.username) | (User.email == user_in.email))
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Nom d'utilisateur ou email déjà utilisé")
    if user_in.role not in ("admin", "chef_equipe", "technicien", "lecteur"):
        raise HTTPException(status_code=400, detail="Rôle invalide")
    user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_activity(db, current_user, "créé", "utilisateur", user.id, user.username)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    update: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.id == current_user.id and update.is_active is False:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous désactiver vous-même")
    if update.role is not None:
        if update.role not in ("admin", "chef_equipe", "technicien", "lecteur"):
            raise HTTPException(status_code=400, detail="Rôle invalide")
        if user.id == current_user.id and update.role != "admin":
            raise HTTPException(
                status_code=400, detail="Vous ne pouvez pas retirer votre propre rôle admin"
            )
        user.role = update.role
    if update.is_active is not None:
        user.is_active = update.is_active
    if update.email is not None:
        conflict = db.query(User).filter(User.email == update.email, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Email déjà utilisé")
        user.email = update.email
    db.commit()
    db.refresh(user)
    action = "modifié"
    if update.is_active is False:
        action = "désactivé"
    elif update.is_active is True:
        action = "activé"
    log_activity(db, current_user, action, "utilisateur", user.id, user.username)
    return user


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    body: PasswordReset,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (min. 6 caractères)")
    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    log_activity(db, current_user, "réinitialisé", "utilisateur", user.id, user.username)
    return {"ok": True, "message": "Mot de passe réinitialisé"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte"
        )
    label = user.username
    db.delete(user)
    db.commit()
    log_activity(db, current_user, "supprimé", "utilisateur", user_id, label)
    return {"ok": True}


# Conserver /register pour compatibilité
@router.post("/register", response_model=UserOut)
def register(
    user_in: UserCreate, db: Session = Depends(get_db), current_user=Depends(require_admin)
):
    return create_user(user_in, db, current_user)
