from sqlalchemy.orm import Session
from app.models.intervention import Intervention
from app.core.activity import log_activity


def _label(inter: Intervention) -> str:
    return inter.commentaire[:60] if inter.commentaire else f"BT {inter.type_bt} #{inter.id}"


class InterventionService:
    @staticmethod
    def create(db: Session, data: dict, user) -> Intervention:
        """Crée une Intervention. `data` peut venir d'un InterventionCreate validé
        (création manuelle) ou être construit directement par un autre service
        (ex: PanneService, pour une intervention auto-créée non assignée)."""
        inter = Intervention(**data)
        db.add(inter)
        db.commit()
        db.refresh(inter)
        log_activity(db, user, "créé", "intervention", inter.id, _label(inter))
        return inter
