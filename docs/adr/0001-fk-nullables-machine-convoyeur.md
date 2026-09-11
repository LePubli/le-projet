# FK nullables pour cibler Machine ou Convoyeur sur Panne, Intervention, MaintenancePreventive

Panne, Intervention et MaintenancePreventive ne pouvaient référencer qu'une
Machine (`machine_id` NOT NULL), alors que le métier veut aussi pouvoir
cibler un Convoyeur directement. On ajoute une colonne `convoyeur_id`
nullable à côté de `machine_id` (rendu nullable), avec une validation
applicative « exactement un des deux », plutôt qu'une abstraction commune
« Équipement » : seules ces 3 tables sur ~15 sont concernées (SafetyChecklist,
ActivityLog et Piece utilisent déjà des liaisons génériques ou indirectes qui
n'ont pas ce problème), donc le coût d'une abstraction partagée dépasserait
le gain.
