from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MachineBase(BaseModel):
    nom: str
    site: Optional[str] = None
    ligne: Optional[str] = None
    zone: Optional[str] = None
    etage: Optional[int] = 0
    fabricant: Optional[str] = None
    modele: Optional[str] = None
    code_interne: Optional[str] = None
    statut: Optional[str] = "operationnel"
    notes: Optional[str] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    couleur: Optional[str] = None
    taille_pastille: Optional[float] = None
    rotation: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class MachineCreate(MachineBase):
    pass


class MachineUpdate(MachineBase):
    nom: Optional[str] = None


class MachineOut(MachineBase):
    id: int
    qr_code: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True