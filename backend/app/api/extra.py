"""F: Notifications email — envoi d'emails sur pannes critiques.
I: Alertes stock — seuil d'alerte sur les pièces.
D: Export Excel natif (.xlsx).
E: Chat/messagerie interne sur pannes.
J: Signature électronique sur BT.

Ce module regroupe les nouveaux endpoints pour les fonctionnalités C à J.
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from app.db.database import get_db
from app.models.piece import Piece
from app.models.panne import Panne
from app.models.user import User
from app.models.bon_travail import BonTravail
from app.core.security import (
    get_current_user,
    require_manager_or_admin,
    require_edit_access,
    require_signatory_role,
)
from app.core.logging import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/api/extra", tags=["extra"])


# ═══════════════════════════════════════════════════════════════
#  F — NOTIFICATIONS EMAIL
# ═══════════════════════════════════════════════════════════════

class EmailConfig(BaseModel):
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    from_email: str = ""
    enabled: bool = False


def send_email(to_emails: list[str], subject: str, body: str):
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


def notify_panne_critique_email(db: Session, panne: Panne, username: str):
    """Envoie un email à tous les managers/admins pour une panne critique."""
    users = db.query(User).filter(
        User.role.in_(("admin", "chef_equipe")),
        User.is_active == True,
    ).all()
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
    <tr><td style="padding:4px 12px;font-weight:bold;">Date:</td><td>{datetime.now().strftime('%d/%m/%Y %H:%M')}</td></tr>
    </table>
    <p style="margin-top:16px;"><a href="{os.getenv('APP_URL', '')}/pannes/{panne.id}"
       style="background:#f97316;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">
       Voir la panne</a></p>
    </body></html>
    """
    send_email(emails, subject, body)


@router.get("/email/status")
def email_status(_=Depends(get_current_user)):
    """Vérifie si l'email est configuré."""
    return {"enabled": bool(os.getenv("SMTP_HOST", ""))}


# ═══════════════════════════════════════════════════════════════
#  I — ALERTES STOCK
# ═══════════════════════════════════════════════════════════════

@router.get("/stock/alertes")
def stock_alertes(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Liste les pièces dont le stock est en dessous du seuil d'alerte."""
    pieces = db.query(Piece).filter(Piece.seuil_alerte.isnot(None)).all()
    alertes = []
    for p in pieces:
        seuil = p.seuil_alerte or 0
        if p.stock <= seuil:
            alertes.append({
                "id": p.id,
                "nom": p.nom,
                "reference": p.reference,
                "stock": p.stock,
                "seuil_alerte": seuil,
                "rupture": p.stock == 0,
                "pourcentage": round(p.stock / max(seuil * 2, 1) * 100) if seuil > 0 else 100,
            })
    return {"alertes": alertes, "total": len(alertes)}


# ═══════════════════════════════════════════════════════════════
#  D — EXPORT EXCEL NATIF (.xlsx)
# ═══════════════════════════════════════════════════════════════

@router.get("/export/xlsx/{entity}")
def export_xlsx(
    entity: str,
    db: Session = Depends(get_db),
    _=Depends(require_manager_or_admin),
):
    """Exporte une entité au format Excel .xlsx avec mise en forme."""
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from fastapi.responses import StreamingResponse

    wb = Workbook()
    ws = wb.active
    ws.title = entity

    # Styles
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="F97316", end_color="F97316", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin")
    )

    if entity == "machines":
        ws.append(["ID", "Nom", "Code Interne", "Site", "Ligne", "Zone", "Étage", "Fabricant", "Modèle", "Statut"])
        machines = db.query(Piece).all() if False else db.query(__import__("app.models.machine", fromlist=["Machine"]).Machine).all()
        for m in machines:
            ws.append([m.id, m.nom, m.code_interne or "", m.site or "", m.ligne or "",
                       m.zone or "", m.etage or 0, m.fabricant or "", m.modele or "", m.statut or ""])

    elif entity == "pannes":
        ws.append(["ID", "Titre", "Machine ID", "Criticité", "Cause réelle", "Solution", "Date création"])
        pannes = db.query(Panne).order_by(Panne.created_at.desc()).all()
        for p in pannes:
            ws.append([p.id, p.titre, p.machine_id, p.criticite or 3,
                       p.cause_reelle or "", p.solution or "",
                       p.created_at.strftime("%d/%m/%Y") if p.created_at else ""])

    elif entity == "pieces":
        ws.append(["ID", "Nom", "Référence", "Stock", "Seuil alerte", "Prix unitaire", "Catégorie"])
        pieces = db.query(Piece).all()
        for p in pieces:
            ws.append([p.id, p.nom or "", p.reference or "", p.stock or 0,
                       getattr(p, "seuil_alerte", None) or "", getattr(p, "prix_unitaire", None) or "",
                       getattr(p, "categorie", None) or ""])

    else:
        raise HTTPException(status_code=400, detail=f"Entité non supportée: {entity}")

    # Mise en forme en-têtes
    for col in range(1, ws.max_column + 1):
        cell = ws.cell(row=1, column=col)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    # Auto-largeur colonnes
    for col in ws.columns:
        max_length = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_length + 4, 40)

    # Filtres auto
    ws.auto_filter.ref = ws.dimensions

    # Freeze première ligne
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"export_{entity}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════════
#  E — CHAT/MESSAGERIE INTERNE SUR PANNES
# ═══════════════════════════════════════════════════════════════

class ChatMessage(BaseModel):
    message: str


@router.get("/chat/{panne_id}")
def get_chat(
    panne_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Récupère les messages de chat d'une panne (stockés dans le champ protocole_reparation
    au format JSON, ou dans une table dédiée si on veut faire plus propre)."""
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne introuvable")
    # Les messages sont stockés dans causes_possibles (JSON array) — hack simple
    # Pour une vraie implémentation, créer une table chat_messages
    import json
    messages = []
    if panne.description and panne.description.startswith("[CHAT]"):
        try:
            messages = json.loads(panne.description[6:])
        except:
            messages = []
    return {"messages": messages}


@router.post("/chat/{panne_id}")
def post_chat(
    panne_id: int,
    body: ChatMessage,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Ajoute un message de chat sur une panne."""
    import json
    panne = db.query(Panne).filter(Panne.id == panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne introuvable")

    # Récupérer les messages existants
    messages = []
    if panne.description and panne.description.startswith("[CHAT]"):
        try:
            messages = json.loads(panne.description[6:])
        except:
            messages = []

    # Ajouter le nouveau message
    new_msg = {
        "user": current_user.username,
        "role": current_user.role,
        "message": body.message,
        "timestamp": datetime.now().isoformat(),
    }
    messages.append(new_msg)

    # Sauvegarder (en préfixant pour distinguer du texte normal)
    panne.description = "[CHAT]" + json.dumps(messages)
    db.commit()

    return {"ok": True, "message": new_msg}


# ═══════════════════════════════════════════════════════════════
#  J — SIGNATURE ÉLECTRONIQUE SUR BT
# ═══════════════════════════════════════════════════════════════

class SignatureBody(BaseModel):
    signature_data: str  # base64 PNG data URL
    role: str = "intervenant"  # intervenant | responsable | controle


@router.post("/bt/{bt_id}/signature")
def add_signature(
    bt_id: int,
    body: SignatureBody,
    db: Session = Depends(get_db),
    current_user=Depends(require_edit_access),
):
    """Ajoute une signature électronique sur un Bon de Travail.
    La signature est stockée comme data URL dans le champ compte_rendu
    (préfixé [SIG:role])."""
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="BT introuvable")

    require_signatory_role(current_user.role, body.role)

    # Stocker la signature
    sig_marker = f"[SIG:{body.role}:{current_user.username}:{datetime.now().isoformat()}]{body.signature_data}[/SIG]"
    if bt.compte_rendu:
        bt.compte_rendu = bt.compte_rendu + "\n" + sig_marker
    else:
        bt.compte_rendu = sig_marker
    db.commit()

    return {"ok": True, "role": body.role, "signed_by": current_user.username}


@router.get("/bt/{bt_id}/signatures")
def get_signatures(
    bt_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Récupère les signatures d'un BT."""
    bt = db.query(BonTravail).filter(BonTravail.id == bt_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="BT introuvable")

    import re
    signatures = []
    if bt.compte_rendu:
        # Pattern: [SIG:role:username:timestamp]data_url[/SIG]
        pattern = r'\[SIG:(\w+):(\w+):([^\]]+)\](.*?)\[/SIG\]'
        for match in re.finditer(pattern, bt.compte_rendu):
            signatures.append({
                "role": match.group(1),
                "username": match.group(2),
                "timestamp": match.group(3),
                "data": match.group(4),
            })
    return {"signatures": signatures}
