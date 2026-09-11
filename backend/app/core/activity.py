from sqlalchemy.orm import Session
from app.models.activity_log import ActivityLog


def compute_diff(old_obj: dict, new_obj: dict) -> dict | None:
    """Calcule le diff entre ancien et nouveau état d'un objet.
    Retourne {"field": {"before": old_val, "after": new_val}} ou None si aucun changement.
    """
    changes = {}
    all_keys = set(list(old_obj.keys()) + list(new_obj.keys()))
    for key in all_keys:
        old_val = old_obj.get(key)
        new_val = new_obj.get(key)
        if old_val != new_val:
            changes[key] = {"before": old_val, "after": new_val}
    return changes if changes else None


def log_activity(
    db: Session,
    user,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    entity_label: str | None = None,
    changes: dict | None = None,
):
    try:
        entry = ActivityLog(
            username=user.username,
            user_role=user.role,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            changes=changes,
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()


def apply_update_and_log(
    db: Session, obj, update_data: dict, user, entity_type: str, label_fn, with_diff: bool = True
):
    """Applique un dict de champs à modifier sur `obj`, journalise l'action.

    `label_fn` reçoit l'objet mis à jour et retourne le libellé à journaliser
    (utile quand le champ affiché, ex. un titre, fait partie de la mise à jour).
    `with_diff=False` désactive le calcul du diff avant/après (pour préserver
    le comportement d'endpoints qui ne journalisaient pas de diff avant leur
    passage à ce helper). Retourne l'objet modifié.
    """
    old_values = (
        {k: getattr(obj, k) for k in update_data.keys() if hasattr(obj, k)} if with_diff else None
    )
    for key, value in update_data.items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    changes = None
    if with_diff:
        new_values = {k: getattr(obj, k) for k in old_values.keys()}
        changes = compute_diff(old_values, new_values)
    log_activity(db, user, "modifié", entity_type, obj.id, label_fn(obj), changes=changes)
    return obj
