from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ConvoyeurBase(BaseModel):
    nom: str
    code_interne: Optional[str] = None
    ligne: Optional[str] = None
    zone: Optional[str] = None
    etage: Optional[int] = 0
    type_convoyeur: Optional[str] = "bande"
    source_machine_id: Optional[int] = None
    target_machine_id: Optional[int] = None
    statut: Optional[str] = "operationnel"
    longueur_m: Optional[float] = None
    vitesse: Optional[str] = None
    path_points: Optional[List[dict]] = []
    notes: Optional[str] = None


class ConvoyeurCreate(ConvoyeurBase):
    pass


class ConvoyeurUpdate(BaseModel):
    nom: Optional[str] = None
    code_interne: Optional[str] = None
    ligne: Optional[str] = None
    zone: Optional[str] = None
    etage: Optional[int] = None
    type_convoyeur: Optional[str] = None
    source_machine_id: Optional[int] = None
    target_machine_id: Optional[int] = None
    statut: Optional[str] = None
    longueur_m: Optional[float] = None
    vitesse: Optional[str] = None
    path_points: Optional[List[dict]] = None
    notes: Optional[str] = None


class ConvoyeurOut(ConvoyeurBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True