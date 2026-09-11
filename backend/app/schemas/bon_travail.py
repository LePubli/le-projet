"""Backend schemas → backend/app/schemas/bon_travail.py
   Pydantic schemas for Bons de Travail (Entretien / Nettoyage)
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ─── Médias (photos + vidéos) ───────────────────────────────────
class MediaItem(BaseModel):
    url: str
    type: str  # "image" | "video"
    name: Optional[str] = None


# ─── Gammes ─────────────────────────────────────────────────────
class BTGammeOut(BaseModel):
    id: int
    ordre: int
    code_gamme: Optional[str] = None
    famille_gamme: Optional[str] = None
    texte_gamme: str
    consignation: bool = False
    condamnation: bool = False
    completed: bool = False
    duree_estimee_h: Optional[float] = None

    model_config = {"from_attributes": True}


class BTGammeCreate(BaseModel):
    ordre: int = 1
    code_gamme: Optional[str] = None
    famille_gamme: Optional[str] = None
    texte_gamme: str
    consignation: bool = False
    condamnation: bool = False
    completed: bool = False
    duree_estimee_h: Optional[float] = None


class BTGammeUpdate(BaseModel):
    completed: Optional[bool] = None
    texte_gamme: Optional[str] = None


# ─── Pièces ─────────────────────────────────────────────────────
class BTPieceOut(BaseModel):
    id: int
    reference: Optional[str] = None
    designation: Optional[str] = None
    quantite: Optional[int] = 1
    cout_unitaire: Optional[float] = 0
    cout_ligne: Optional[float] = 0

    model_config = {"from_attributes": True}


class BTPieceCreate(BaseModel):
    reference: Optional[str] = None
    designation: Optional[str] = None
    quantite: Optional[int] = 1
    cout_unitaire: Optional[float] = 0


# ─── Compteurs ──────────────────────────────────────────────────
class BTCompteurOut(BaseModel):
    id: int
    nom_compteur: Optional[str] = None
    valeur: Optional[float] = None
    cumul: Optional[float] = None
    releve: Optional[float] = None
    val_courante: Optional[float] = None

    model_config = {"from_attributes": True}


class BTCompteurCreate(BaseModel):
    nom_compteur: Optional[str] = None
    valeur: Optional[float] = None
    cumul: Optional[float] = None
    releve: Optional[float] = None
    val_courante: Optional[float] = None


# ─── Visa ───────────────────────────────────────────────────────
class BTVisaOut(BaseModel):
    id: int
    role: Optional[str] = None
    nom: Optional[str] = None
    visa: Optional[str] = None
    date_visa: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BTVisaCreate(BaseModel):
    role: Optional[str] = None
    nom: Optional[str] = None
    visa: Optional[str] = None


# ─── Bon de Travail (résumé pour liste) ────────────────────────
class BonTravailListItem(BaseModel):
    id: int
    numero: str
    type_bt: str
    statut: str
    titre: str
    machine_id: Optional[int] = None
    machine_nom: Optional[str] = None
    degre_urgence: Optional[str] = None
    date_creation: Optional[datetime] = None
    date_debut_prevue: Optional[datetime] = None
    date_cloture: Optional[datetime] = None
    demandeur_nom: Optional[str] = None
    intervenant_nom: Optional[str] = None
    gammes_total: int = 0
    gammes_faites: int = 0

    model_config = {"from_attributes": True}


# ─── Bon de Travail (détail complet) ───────────────────────────
class BonTravailOut(BaseModel):
    id: int
    numero: str
    type_bt: str
    statut: str
    titre: str
    description: Optional[str] = None
    machine_id: Optional[int] = None
    arborescence: Optional[str] = None
    date_creation: Optional[datetime] = None
    date_debut_prevue: Optional[datetime] = None
    date_debut_reelle: Optional[datetime] = None
    date_fin_prevue: Optional[datetime] = None
    date_cloture: Optional[datetime] = None
    demandeur_id: Optional[int] = None
    intervenant_id: Optional[int] = None
    degre_urgence: Optional[str] = None
    famille: Optional[str] = None
    duree_immobilisation_h: Optional[float] = 0
    cout_total: Optional[float] = 0
    temps_reaction_h: Optional[float] = 0
    compte_rendu: Optional[str] = None
    calendrier_id: Optional[int] = None
    # Médias attachés au BT (avant/après travaux, observations terrain)
    cause_medias: list[MediaItem] = []
    solution_medias: list[MediaItem] = []
    gammes: list[BTGammeOut] = []
    pieces: list[BTPieceOut] = []
    compteurs: list[BTCompteurOut] = []
    visas: list[BTVisaOut] = []

    model_config = {"from_attributes": True}


# ─── Création ──────────────────────────────────────────────────
class BonTravailCreate(BaseModel):
    type_bt: str = "entretien"  # entretien | nettoyage
    titre: str
    description: Optional[str] = None
    machine_id: Optional[int] = None
    date_debut_prevue: Optional[datetime] = None
    date_fin_prevue: Optional[datetime] = None
    degre_urgence: Optional[str] = "normale"
    famille: Optional[str] = None
    calendrier_id: Optional[int] = None
    demandeur_id: Optional[int] = None
    gammes: list[BTGammeCreate] = []
    compteurs: list[BTCompteurCreate] = []
    cause_medias: list[MediaItem] = []
    solution_medias: list[MediaItem] = []


# ─── Mise à jour ────────────────────────────────────────────────
class BonTravailUpdate(BaseModel):
    statut: Optional[str] = None
    titre: Optional[str] = None
    description: Optional[str] = None
    machine_id: Optional[int] = None
    arborescence: Optional[str] = None
    date_debut_reelle: Optional[datetime] = None
    date_fin_prevue: Optional[datetime] = None
    date_cloture: Optional[datetime] = None
    intervenant_id: Optional[int] = None
    degre_urgence: Optional[str] = None
    famille: Optional[str] = None
    duree_immobilisation_h: Optional[float] = None
    cout_total: Optional[float] = None
    temps_reaction_h: Optional[float] = None
    compte_rendu: Optional[str] = None
    cause_medias: Optional[list[MediaItem]] = None
    solution_medias: Optional[list[MediaItem]] = None