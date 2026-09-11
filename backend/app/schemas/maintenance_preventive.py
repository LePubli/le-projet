from pydantic import BaseModel, model_validator
from typing import Optional
from datetime import datetime
from app.core.validators import validate_machine_or_convoyeur


class MaintenancePreventiveBase(BaseModel):
    machine_id: Optional[int] = None
    convoyeur_id: Optional[int] = None
    titre: str
    description: Optional[str] = None
    frequence_jours: int
    responsable: Optional[str] = None
    alert_jours: Optional[int] = 7
    actif: Optional[bool] = True


class MaintenancePreventiveCreate(MaintenancePreventiveBase):
    @model_validator(mode="after")
    def _check_target(self):
        validate_machine_or_convoyeur(self.machine_id, self.convoyeur_id)
        return self


class MaintenancePreventiveUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    frequence_jours: Optional[int] = None
    responsable: Optional[str] = None
    alert_jours: Optional[int] = None
    actif: Optional[bool] = None


class MaintenancePreventiveOut(MaintenancePreventiveBase):
    id: int
    derniere_execution: Optional[datetime] = None
    created_at: datetime
    machine_nom: Optional[str] = None
    prochaine_echeance: Optional[datetime] = None
    statut: Optional[str] = None
    jours_restants: Optional[int] = None

    class Config:
        from_attributes = True
