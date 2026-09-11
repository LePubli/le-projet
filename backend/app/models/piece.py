from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class Piece(Base):
    __tablename__ = "pieces"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String, unique=True, index=True, nullable=False)
    nom = Column(String, nullable=False)
    stock = Column(Integer, default=0)
    seuil_alerte = Column(Integer, nullable=True)  # I: alerte quand stock <= seuil
    prix_unitaire = Column(Float, nullable=True)   # I: prix pour calculs
    emplacement = Column(String)
    fournisseur = Column(String)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    pannes_pieces = relationship("PannesPieces", back_populates="piece")


class PannesPieces(Base):
    __tablename__ = "pannes_pieces"

    id = Column(Integer, primary_key=True, index=True)
    panne_id = Column(Integer, ForeignKey("pannes.id"))
    piece_id = Column(Integer, ForeignKey("pieces.id"))
    quantite = Column(Integer, default=1)

    panne = relationship("Panne", back_populates="pieces_utilisees")
    piece = relationship("Piece", back_populates="pannes_pieces")
