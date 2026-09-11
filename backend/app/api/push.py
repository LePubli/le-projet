"""Web Push notifications — abonnement et envoi de push."""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.db.database import get_db
from app.models.push_subscription import PushSubscription
from app.core.security import get_current_user
from app.core.config import VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIM_EMAIL
from app.core.logging import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/api/push", tags=["push"])


class SubscribeBody(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}


@router.get("/vapid-public-key")
def get_vapid_public_key(_=Depends(get_current_user)):
    """Retourne la clé publique VAPID pour l'abonnement côté navigateur."""
    if not VAPID_PUBLIC_KEY:
        return {"enabled": False, "publicKey": ""}
    return {"enabled": True, "publicKey": VAPID_PUBLIC_KEY}


@router.post("/subscribe")
def subscribe(
    body: SubscribeBody,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Abonne l'utilisateur courant aux notifications push."""
    if not body.endpoint or not body.keys.get("p256dh") or not body.keys.get("auth"):
        raise HTTPException(status_code=400, detail="Subscription invalide")

    # Upsert : si l'endpoint existe déjà, on met à jour l'user_id
    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint
    ).first()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = body.keys["p256dh"]
        existing.auth = body.keys["auth"]
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.keys["p256dh"],
            auth=body.keys["auth"],
        )
        db.add(sub)
    db.commit()
    log.info("push_subscribed", user_id=current_user.id, endpoint=body.endpoint[:80])
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(
    body: SubscribeBody,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Désabonne l'endpoint des notifications push."""
    sub = db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint,
        PushSubscription.user_id == current_user.id,
    ).first()
    if sub:
        db.delete(sub)
        db.commit()
        log.info("push_unsubscribed", user_id=current_user.id)
    return {"ok": True}


def send_push_to_user(db: Session, user_id: int, title: str, message: str, url: str = "/"):
    """Envoie une notification push à tous les appareils d'un utilisateur.
    À appeler depuis les autres modules (ex: création de panne critique).
    """
    if not VAPID_PRIVATE_KEY:
        log.warning("push_not_configured", hint="VAPID_PRIVATE_KEY manquant")
        return 0

    from pywebpush import webpush, WebPushException

    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=f'{{"title":"{title}","message":"{message}","url":"{url}"}}',
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{VAPID_CLAIM_EMAIL}"},
            )
            sent += 1
        except WebPushException as e:
            log.warning("push_send_failed", user_id=user_id, error=str(e)[:200])
            # Si l'endpoint est invalide (410 Gone), on le supprime
            if hasattr(e, "response") and e.response and e.response.status_code == 410:
                db.delete(sub)
                db.commit()
        except Exception as e:
            log.exception("push_error", user_id=user_id, error=str(e)[:200])

    log.info("push_sent", user_id=user_id, sent=sent, total=len(subs))
    return sent


def broadcast_push(db: Session, title: str, message: str, url: str = "/"):
    """Envoie une notification push à TOUS les utilisateurs abonnés.
    À utiliser pour les pannes critiques (criticite >= 4).
    """
    from sqlalchemy import distinct
    user_ids = db.query(distinct(PushSubscription.user_id)).all()
    total_sent = 0
    for (uid,) in user_ids:
        total_sent += send_push_to_user(db, uid, title, message, url)
    return total_sent
