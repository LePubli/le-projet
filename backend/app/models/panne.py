from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class Panne(Base):
    __tablename__ = "pannes"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    convoyeur_id = Column(Integer, ForeignKey("convoyeurs.id"), nullable=True)
    titre = Column(String, nullable=False)
    description = Column(Text)
    causes_possibles = Column(JSON, default=[])
    cause_reelle = Column(Text)
    solution = Column(Text)
    protocole_reparation = Column(Text)
    criticite = Column(Integer, default=3)
    temps_moyen_reparation = Column(Integer)
    photos = Column(JSON, default=[])
    # Médias attachés spécifiquement à la cause et à la solution
    # (photos + vidéos). Format: [{"url": "/api/uploads/xxx.jpg", "type": "image"|"video", "name": "..."}]
    cause_medias = Column(JSON, default=[])
    solution_medias = Column(JSON, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    machine = relationship("Machine", back_populates="pannes")
    convoyeur = relationship("Convoyeur", back_populates="pannes")
    interventions = relationship("Intervention", back_populates="panne")
    pieces_utilisees = relationship("PannesPieces", back_populates="panne")
