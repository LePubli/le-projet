from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class SafetyChecklist(Base):
    __tablename__ = "safety_checklists"

    id = Column(Integer, primary_key=True, index=True)
    titre = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    etapes = Column(JSON, nullable=False, default=[])
    zone = Column(String, nullable=True)
    type_equip = Column(String, nullable=True)
    actif = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    intervention_checklists = relationship("InterventionChecklist", back_populates="checklist")


class InterventionChecklist(Base):
    __tablename__ = "intervention_checklists"

    id = Column(Integer, primary_key=True, index=True)
    intervention_id = Column(Integer, ForeignKey("interventions.id", ondelete="CASCADE"), nullable=False)
    checklist_id = Column(Integer, ForeignKey("safety_checklists.id", ondelete="CASCADE"), nullable=False)
    etapes_cochees = Column(JSON, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    intervention = relationship("Intervention")
    checklist = relationship("SafetyChecklist", back_populates="intervention_checklists")