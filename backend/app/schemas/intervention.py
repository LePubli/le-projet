from pydantic import BaseModel, model_validator
from typing import Optional, List
from datetime import datetime
from app.core.validators import validate_machine_or_convoyeur


class InterventionBase(BaseModel):
    machine_id: Optional[int] = None
    convoyeur_id: Optional[int] = None
    panne_id: Optional[int] = None
    technicien: Optional[str] = None
    duree: Optional[int] = None
    commentaire: Optional[str] = None
    photos_avant: Optional[List[str]] = []
    photos_apres: Optional[List[str]] = []
    type_bt: Optional[str] = "reparation"
    statut: Optional[str] = "en_cours"
    date_intervention: Optional[datetime] = None


class InterventionCreate(InterventionBase):
    technicien: str

    @model_validator(mode="after")
    def _check_target(self):
        validate_machine_or_convoyeur(self.machine_id, self.convoyeur_id)
        return self


class InterventionUpdate(BaseModel):
    technicien: Optional[str] = None
    duree: Optional[int] = None
    commentaire: Optional[str] = None
    photos_avant: Optional[List[str]] = None
    photos_apres: Optional[List[str]] = None
    validee: Optional[bool] = None
    validee_par: Optional[str] = None
    type_bt: Optional[str] = None
    statut: Optional[str] = None


class InterventionOut(InterventionBase):
    id: int
    validee: bool
    validee_par: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
