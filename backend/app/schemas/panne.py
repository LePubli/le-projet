from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime
from app.core.validators import validate_machine_or_convoyeur


class MediaItem(BaseModel):
    """Un média attaché à une cause ou une solution (photo ou vidéo)."""

    url: str
    type: str = Field(..., description='"image" ou "video"')
    name: Optional[str] = None


class PanneBase(BaseModel):
    machine_id: Optional[int] = None
    convoyeur_id: Optional[int] = None
    titre: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    causes_possibles: Optional[List[str]] = []
    cause_reelle: Optional[str] = Field(None, max_length=2000)
    solution: Optional[str] = Field(None, max_length=5000)
    criticite: Optional[int] = Field(
        3, ge=1, le=5, description="Criticité de 1 (très faible) à 5 (critique)"
    )
    temps_moyen_reparation: Optional[int] = Field(None, ge=0, le=100000)
    photos: Optional[List[str]] = []
    cause_medias: Optional[List[MediaItem]] = []
    solution_medias: Optional[List[MediaItem]] = []


class PanneCreate(PanneBase):
    @model_validator(mode="after")
    def _check_target(self):
        validate_machine_or_convoyeur(self.machine_id, self.convoyeur_id)
        return self


class PanneUpdate(BaseModel):
    titre: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    causes_possibles: Optional[List[str]] = None
    cause_reelle: Optional[str] = Field(None, max_length=2000)
    solution: Optional[str] = Field(None, max_length=5000)
    protocole_reparation: Optional[str] = Field(None, max_length=20000)
    criticite: Optional[int] = Field(None, ge=1, le=5)
    temps_moyen_reparation: Optional[int] = Field(None, ge=0, le=100000)
    photos: Optional[List[str]] = None
    cause_medias: Optional[List[MediaItem]] = None
    solution_medias: Optional[List[MediaItem]] = None


class PanneOut(PanneBase):
    id: int
    protocole_reparation: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
