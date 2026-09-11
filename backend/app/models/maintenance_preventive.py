from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class MaintenancePreventive(Base):
    __tablename__ = "maintenances_preventives"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id", ondelete="CASCADE"), nullable=True)
    convoyeur_id = Column(Integer, ForeignKey("convoyeurs.id", ondelete="CASCADE"), nullable=True)
    titre = Column(String, nullable=False)
    description = Column(Text)
    frequence_jours = Column(Integer, nullable=False)
    derniere_execution = Column(DateTime(timezone=True), nullable=True)
    responsable = Column(String)
    alert_jours = Column(Integer, default=7)
    actif = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    machine = relationship("Machine")
    convoyeur = relationship("Convoyeur")
