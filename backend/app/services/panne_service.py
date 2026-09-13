from sqlalchemy.orm import Session
from app.models.panne import Panne
from app.core.activity import log_activity
from app.core.notifications import create_notification
from app.services.intervention_service import InterventionService

CRITICITE_LABELS = {1: "Très faible", 2: "Faible", 3: "Moyen", 4: "Élevé", 5: "Critique"}


class PanneService:
    @staticmethod
    def create(db: Session, data: dict, user) -> Panne:
        panne = Panne(**data)
        db.add(panne)
        db.commit()
        db.refresh(panne)
        log_activity(db, user, "créé", "panne", panne.id, panne.titre)

        intervention = InterventionService.create(
            db,
            {
                "machine_id": panne.machine_id,
                "convoyeur_id": panne.convoyeur_id,
                "panne_id": panne.id,
                "technicien": None,
                "type_bt": "reparation",
            },
            user,
        )
        create_notification(
            db,
            title="Intervention à assigner",
            message=f"{panne.titre} — non assignée",
            notif_type="info",
            entity_type="intervention",
            entity_id=intervention.id,
            target_roles=["chef_equipe", "admin"],
        )

        if panne.criticite and panne.criticite >= 4:
            notif_type = "critique" if panne.criticite == 5 else "majeure"
            create_notification(
                db,
                title=f"Panne {CRITICITE_LABELS.get(panne.criticite, '')} signalée",
                message=f"{panne.titre} — signalée par {user.username}",
                notif_type=notif_type,
                entity_type="panne",
                entity_id=panne.id,
            )
            try:
                from app.api.push import broadcast_push

                broadcast_push(
                    db,
                    title=f"Panne {CRITICITE_LABELS.get(panne.criticite, 'critique')}",
                    message=f"{panne.titre} — signalée par {user.username}",
                    url=f"/pannes/{panne.id}",
                )
            except Exception:
                pass  # Push est optionnel — ne pas faire échouer la création de panne
            try:
                from app.services.extra import notify_panne_critique_email

                notify_panne_critique_email(db, panne, user.username)
            except Exception:
                pass  # Email est optionnel

        return panne
