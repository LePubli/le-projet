from sqlalchemy.orm import Session
from app.models.notification import Notification


def create_notification(
    db: Session,
    title: str,
    message: str,
    notif_type: str = "info",
    entity_type: str | None = None,
    entity_id: int | None = None,
    target_roles: list[str] | None = None,
):
    try:
        notif = Notification(
            title=title,
            message=message,
            type=notif_type,
            entity_type=entity_type,
            entity_id=entity_id,
            target_roles=target_roles,
        )
        db.add(notif)
        db.commit()
    except Exception:
        db.rollback()
