from sqlalchemy import Column, Integer, String, DateTime, Text, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class Convoyeur(Base):
    __tablename__ = "convoyeurs"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String, nullable=False)
    code_interne = Column(String, unique=True, index=True)
    ligne = Column(String)
    zone = Column(String)
    etage = Column(Integer, nullable=True, default=0)
    type_convoyeur = Column(String, default="bande")  # bande, chaine, vis, rouleaux
    source_machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    target_machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    statut = Column(String, default="operationnel")
    longueur_m = Column(Float, nullable=True)
    vitesse = Column(String, nullable=True)
    path_points = Column(JSON, default=[])  # [{x, y}, ...] for SVG drawing
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    source_machine = relationship(
        "Machine", foreign_keys=[source_machine_id], back_populates="convoyeurs_source"
    )
    target_machine = relationship(
        "Machine", foreign_keys=[target_machine_id], back_populates="convoyeurs_target"
    )
    pannes = relationship("Panne", back_populates="convoyeur")
    interventions = relationship("Intervention", back_populates="convoyeur")
