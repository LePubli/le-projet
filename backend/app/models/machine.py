from sqlalchemy import Column, Integer, String, DateTime, Text, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String, nullable=False)
    site = Column(String)
    ligne = Column(String)
    zone = Column(String)
    etage = Column(Integer, nullable=True, default=0)
    fabricant = Column(String)
    modele = Column(String)
    code_interne = Column(String, unique=True, index=True)
    statut = Column(String, default="operationnel")
    qr_code = Column(Text)
    notes = Column(Text)
    pos_x = Column(Float, nullable=True)
    pos_y = Column(Float, nullable=True)
    couleur = Column(String(7), nullable=True)  # hex color e.g. #22c55e
    taille_pastille = Column(Float, nullable=True)  # raw em value (e.g. 0.9, 1.4)
    rotation = Column(Float, nullable=True)  # degrees 0-360 for label orientation
    latitude = Column(Float, nullable=True)   # GPS lat for map view
    longitude = Column(Float, nullable=True)  # GPS lng for map view
    heures_fonctionnement = Column(Float, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    pannes = relationship("Panne", back_populates="machine")
    interventions = relationship("Intervention", back_populates="machine")
    convoyeurs_source = relationship("Convoyeur", foreign_keys="Convoyeur.source_machine_id", back_populates="source_machine")
    convoyeurs_target = relationship("Convoyeur", foreign_keys="Convoyeur.target_machine_id", back_populates="target_machine")