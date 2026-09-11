# TriMaint

GMAO (gestion de maintenance assistée par ordinateur) pour Triselec — gestion
des pannes, interventions et bons de travail sur machines et convoyeurs.

## Language

**Panne**:
Un événement de dysfonctionnement sur un équipement (Machine ou Convoyeur)
qui bloque la production. Déclenche automatiquement une Intervention par
convention métier.

**Intervention**:
Le travail réalisé pour résoudre une Panne, ou réalisé de façon planifiée
indépendamment d'une Panne. Peut porter sur une Machine ou un Convoyeur.
Créée sans technicien assigné : l'assignation est un acte manuel d'un
superviseur, jamais automatique.
_Avoid_: BT — le code existant (notifications, champ `type_bt`) utilise ce
sigle pour désigner une Intervention, à ne pas confondre avec l'entité
Bon de travail (BonTravail), sans rapport.

**Bon de travail (BonTravail)**:
Ordre de travail créé manuellement par un superviseur, couvrant le
préventif, le curatif ou l'amélioration. Entité indépendante de Panne et
d'Intervention — aucun lien entre les trois.
_Avoid_: Ticket, ordre de mission

**Machine**:
Équipement de production fixe.

**Convoyeur**:
Équipement de transport reliant deux Machines. Concept métier distinct de
Machine, pas un sous-type.
