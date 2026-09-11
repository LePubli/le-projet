from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PieceBase(BaseModel):
    reference: str
    nom: str
    stock: Optional[int] = 0
    emplacement: Optional[str] = None
    fournisseur: Optional[str] = None
    description: Optional[str] = None


class PieceCreate(PieceBase):
    pass


class PieceUpdate(BaseModel):
    nom: Optional[str] = None
    stock: Optional[int] = None
    emplacement: Optional[str] = None
    fournisseur: Optional[str] = None
    description: Optional[str] = None


class PieceOut(PieceBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
