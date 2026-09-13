"""Logique métier des fonctionnalités regroupées dans l'API extra :
notifications email, alertes stock, export Excel, chat sur pannes,
signature électronique sur BT.

Fonctions sans dépendance FastAPI : appelables depuis l'API, les tests
unitaires ou d'autres services.
"""

import json
import os
import re
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.panne import Panne
from app.models.user import User
from app.core.logging import get_logger

log = get_logger(__name__)


# ─── F — Notifications email ────────────────────────────────────────────────
def send_email(to_emails: List[str], subject: str, body: str) -> bool:
    """Envoie un email via SMTP. Configuration via variables d'env."""
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_email = os.getenv("SMTP_FROM_EMAIL", smtp_user or "noreply@trimaint.local")

    if not smtp_host:
        log.warning("email_not_configured", hint="SMTP_HOST manquant")
        return False

    try:
        msg = MIMEMultipart()
        msg["From"] = from_email
        msg["To"] = ", ".join(to_emails)
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            if smtp_user and smtp_password:
                server.login(smtp_user, smtp_password)
            server.sendmail(from_email, to_emails, msg.as_string())

        log.info("email_sent", to=to_emails, subject=subject)
        return True
    except Exception as e:
        log.error("email_send_failed", error=str(e)[:200])
        return False


def notify_panne_critique_email(db: Session, panne: Panne, username: str) -> None:
    """Envoie un email à tous les managers/admins pour une panne critique."""
    users = (
        db.query(User)
        .filter(
            User.role.in_(("admin", "chef_equipe")),
            User.is_active,
        )
        .all()
    )
    emails = [u.email for u in users if u.email]
    if not emails:
        return

    subject = f"[TriMaint] Panne critique — {panne.titre}"
    body = f"""
    <html><body style="font-family:sans-serif;">
    <h2 style="color:#ef4444;">Panne critique signalée</h2>
    <table style="border-collapse:collapse;">
    <tr><td style="padding:4px 12px;font-weight:bold;">Titre:</td><td>{panne.titre}</td></tr>
    <tr><td style="padding:4px 12px;font-weight:bold;">Criticité:</td><td>{panne.criticite}/5</td></tr>
    <tr><td style="padding:4px 12px;font-weight:bold;">Signalée par:</td><td>{username}</td></tr>
    <tr><td style="padding:4px 12px;font-weight:bold;">Date:</td><td>{datetime.now().strftime('%d/%m/%Y %H:%M')}</td></tr>  # noqa: E501
    </table>
    <p style="margin-top:16px;"><a href="{os.getenv('APP_URL', '')}/pannes/{panne.id}"
       style="background:#f97316;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">
       Voir la panne</a></p>
    </body></html>
    """
    send_email(emails, subject, body)


# ─── I — Alertes stock ──────────────────────────────────────────────────────
def get_stock_alertes(db: Session) -> Dict[str, Any]:
    """Liste les pièces dont le stock est en dessous du seuil d'alerte."""
    from app.models.piece import Piece

    pieces = db.query(Piece).filter(Piece.seuil_alerte.isnot(None)).all()
    alertes = []
    for p in pieces:
        seuil = p.seuil_alerte or 0
        if p.stock <= seuil:
            alertes.append(
                {
                    "id": p.id,
                    "nom": p.nom,
                    "reference": p.reference,
                    "stock": p.stock,
                    "seuil_alerte": seuil,
                    "rupture": p.stock == 0,
                    "pourcentage": round(p.stock / max(seuil * 2, 1) * 100) if seuil > 0 else 100,
                }
            )
    return {"alertes": alertes, "total": len(alertes)}


# ─── D — Export Excel natif (.xlsx) ─────────────────────────────────────────
XLSX_HEADERS: Dict[str, List[str]] = {
    "machines": [
        "ID",
        "Nom",
        "Code Interne",
        "Site",
        "Ligne",
        "Zone",
        "Étage",
        "Fabricant",
        "Modèle",
        "Statut",
    ],
    "pannes": [
        "ID",
        "Titre",
        "Machine ID",
        "Criticité",
        "Cause réelle",
        "Solution",
        "Date création",
    ],
    "pieces": ["ID", "Nom", "Référence", "Stock", "Seuil alerte", "Prix unitaire", "Catégorie"],
}


def get_xlsx_data(entity: str, db: Session) -> Tuple[List[str], List[List[Any]]]:
    """Récupère en-têtes + lignes de données pour l'export Excel d'une entité."""
    if entity not in XLSX_HEADERS:
        raise ValueError(f"Entité non supportée: {entity}")

    if entity == "machines":
        from app.models.machine import Machine

        rows = [
            [
                m.id,
                m.nom,
                m.code_interne or "",
                m.site or "",
                m.ligne or "",
                m.zone or "",
                m.etage or 0,
                m.fabricant or "",
                m.modele or "",
                m.statut or "",
            ]
            for m in db.query(Machine).all()
        ]
    elif entity == "pannes":
        pannes = db.query(Panne).order_by(Panne.created_at.desc()).all()
        rows = [
            [
                p.id,
                p.titre,
                p.machine_id,
                p.criticite or 3,
                p.cause_reelle or "",
                p.solution or "",
                p.created_at.strftime("%d/%m/%Y") if p.created_at else "",
            ]
            for p in pannes
        ]
    else:  # pieces
        from app.models.piece import Piece

        pieces = db.query(Piece).all()
        rows = [
            [
                p.id,
                p.nom or "",
                p.reference or "",
                p.stock or 0,
                getattr(p, "seuil_alerte", None) or "",
                getattr(p, "prix_unitaire", None) or "",
                getattr(p, "categorie", None) or "",
            ]
            for p in pieces
        ]

    return XLSX_HEADERS[entity], rows


# ─── E — Chat/messagerie interne sur pannes ─────────────────────────────────
# Les messages sont stockés dans Panne.description (préfixé [CHAT], JSON array) —
# hack simple. Pour une vraie implémentation, créer une table chat_messages.
CHAT_PREFIX = "[CHAT]"


def parse_chat_messages(panne: Panne) -> List[Dict[str, Any]]:
    """Extrait les messages de chat stockés dans Panne.description."""
    if panne.description and panne.description.startswith(CHAT_PREFIX):
        try:
            return json.loads(panne.description[len(CHAT_PREFIX) :])
        except (json.JSONDecodeError, ValueError):
            log.warning("chat_parse_error", panne_id=panne.id)
    return []


def append_chat_message(
    db: Session, panne: Panne, username: str, role: str, message: str
) -> Dict[str, Any]:
    """Ajoute un message de chat sur une panne et persiste."""
    messages = parse_chat_messages(panne)
    new_msg = {
        "user": username,
        "role": role,
        "message": message,
        "timestamp": datetime.now().isoformat(),
    }
    messages.append(new_msg)
    panne.description = CHAT_PREFIX + json.dumps(messages)
    db.commit()
    return new_msg


# ─── J — Signature électronique sur BT ──────────────────────────────────────
# Stockée comme marqueur texte dans BonTravail.compte_rendu — hack simple, même
# esprit que le chat ci-dessus.
_SIGNATURE_PATTERN = re.compile(r"\[SIG:(\w+):(\w+):([^\]]+)\](.*?)\[/SIG\]")


def build_signature_marker(role: str, username: str, signature_data: str) -> str:
    """Construit le marqueur texte d'une signature électronique."""
    return f"[SIG:{role}:{username}:{datetime.now().isoformat()}]{signature_data}[/SIG]"


def parse_signatures(compte_rendu: Optional[str]) -> List[Dict[str, str]]:
    """Extrait les signatures stockées dans BonTravail.compte_rendu."""
    if not compte_rendu:
        return []
    return [
        {
            "role": m.group(1),
            "username": m.group(2),
            "timestamp": m.group(3),
            "data": m.group(4),
        }
        for m in _SIGNATURE_PATTERN.finditer(compte_rendu)
    ]
