"""Modèle pour les filtres sauvegardés par utilisateur."""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class SavedFilter(Base):
    __tablename__ = "saved_filters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    entity = Column(String(50), nullable=False)  # "pannes", "bons-travail", "machines", etc.
    filters = Column(JSON, nullable=False, default={})  # {search: "...", statut: "...", ...}
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
