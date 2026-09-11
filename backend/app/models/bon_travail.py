"""Backend model → backend/app/models/bon_travail.py
   Tables: bons_travail, bt_gammes, bt_pieces, bt_compteurs, bt_visa
"""
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Boolean, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base
import enum


class BTType(str, enum.Enum):
    entretien = "entretien"
    nettoyage = "nettoyage"


class BTStatut(str, enum.Enum):
    a_faire = "à faire"
    en_cours = "en cours"
    termine = "terminé"
    cloture = "clôturé"


class BonTravail(Base):
    __tablename__ = "bons_travail"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(50), unique=True, index=True, nullable=False)  # BT N° auto-généré
    type_bt = Column(String(20), nullable=False, default="entretien")  # entretien | nettoyage
    statut = Column(String(20), nullable=False, default="à faire")
    titre = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Machine liée
    machine_id = Column(Integer, ForeignKey("machines.id", ondelete="SET NULL"), nullable=True)
    
    # Arborescence (chemin complet, ex: "Z-Essai > LBP > LBP1 > L400 - Glass breaker")
    arborescence = Column(Text, nullable=True)

    # Dates
    date_creation = Column(DateTime(timezone=True), server_default=func.now())
    date_debut_prevue = Column(DateTime(timezone=True), nullable=True)
    date_debut_reelle = Column(DateTime(timezone=True), nullable=True)
    date_fin_prevue = Column(DateTime(timezone=True), nullable=True)
    date_cloture = Column(DateTime(timezone=True), nullable=True)

    # Demandeur / Intervenant
    demandeur_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    intervenant_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Priorité / urgence
    degre_urgence = Column(String(20), nullable=True)  # basse, normale, haute, urgente
    famille = Column(String(50), nullable=True)  # ex: "Crible à disque"

    # Temps et coûts
    duree_immobilisation_h = Column(Float, nullable=True, default=0)
    cout_total = Column(Float, nullable=True, default=0)
    temps_reaction_h = Column(Float, nullable=True, default=0)

    # Compte rendu
    compte_rendu = Column(Text, nullable=True)

    # Lien avec le calendrier préventif
    calendrier_id = Column(Integer, nullable=True)

    # Médias attachés (photos + vidéos) — observations terrain, avant/après
    # Format: [{"url": "/api/uploads/xxx.jpg", "type": "image"|"video", "name": "..."}]
    cause_medias = Column(JSON, default=[])
    solution_medias = Column(JSON, default=[])

    # Relations
    gammes = relationship("BTGamme", back_populates="bon_travail", cascade="all, delete-orphan", order_by="BTGamme.ordre")
    pieces = relationship("BTPiece", back_populates="bon_travail", cascade="all, delete-orphan")
    compteurs = relationship("BTCompteur", back_populates="bon_travail", cascade="all, delete-orphan")
    visas = relationship("BTVisa", back_populates="bon_travail", cascade="all, delete-orphan")

    # Relations FK vers Machine / User (lazy='joined' évite les N+1 sur la liste)
    machine = relationship(
        "Machine",
        foreign_keys=[machine_id],
        lazy="joined",
    )
    demandeur = relationship(
        "User",
        foreign_keys=[demandeur_id],
        lazy="joined",
    )
    intervenant = relationship(
        "User",
        foreign_keys=[intervenant_id],
        lazy="joined",
    )


class BTGamme(Base):
    __tablename__ = "bt_gammes"

    id = Column(Integer, primary_key=True, index=True)
    bt_id = Column(Integer, ForeignKey("bons_travail.id", ondelete="CASCADE"), nullable=False)
    ordre = Column(Integer, nullable=False, default=1)
    code_gamme = Column(String(50), nullable=True)  # ex: "LUB 2", "ECD 26.2"
    famille_gamme = Column(String(50), nullable=True)
    texte_gamme = Column(Text, nullable=False)  # Description de l'étape
    consignation = Column(Boolean, default=False)
    condamnation = Column(Boolean, default=False)
    completed = Column(Boolean, default=False)
    duree_estimee_h = Column(Float, nullable=True)

    bon_travail = relationship("BonTravail", back_populates="gammes")


class BTPiece(Base):
    __tablename__ = "bt_pieces"

    id = Column(Integer, primary_key=True, index=True)
    bt_id = Column(Integer, ForeignKey("bons_travail.id", ondelete="CASCADE"), nullable=False)
    reference = Column(String(100), nullable=True)
    designation = Column(String(200), nullable=True)
    quantite = Column(Integer, nullable=True, default=1)
    cout_unitaire = Column(Float, nullable=True, default=0)
    cout_ligne = Column(Float, nullable=True, default=0)

    bon_travail = relationship("BonTravail", back_populates="pieces")


class BTCompteur(Base):
    __tablename__ = "bt_compteurs"

    id = Column(Integer, primary_key=True, index=True)
    bt_id = Column(Integer, ForeignKey("bons_travail.id", ondelete="CASCADE"), nullable=False)
    nom_compteur = Column(String(100), nullable=True)
    valeur = Column(Float, nullable=True)
    cumul = Column(Float, nullable=True)
    releve = Column(Float, nullable=True)
    val_courante = Column(Float, nullable=True)

    bon_travail = relationship("BonTravail", back_populates="compteurs")


class BTVisa(Base):
    __tablename__ = "bt_visa"

    id = Column(Integer, primary_key=True, index=True)
    bt_id = Column(Integer, ForeignKey("bons_travail.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(100), nullable=True)  # ex: "Intervenant", "Responsable", "Contrôle qualité"
    nom = Column(String(100), nullable=True)
    visa = Column(String(500), nullable=True)  # Signature text ou data URL
    date_visa = Column(DateTime(timezone=True), nullable=True)

    bon_travail = relationship("BonTravail", back_populates="visas")