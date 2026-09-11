// Types partagés pour le frontend TriMaint

export type UserRole = 'admin' | 'manager' | 'technicien'

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
}

export interface Machine {
  id: number
  nom: string
  site: string | null
  ligne: string | null
  zone: string | null
  etage: number | null
  fabricant: string | null
  modele: string | null
  code_interne: string | null
  statut: string | null
  qr_code: string | null
  notes: string | null
  pos_x: number | null
  pos_y: number | null
  couleur: string | null
  taille_pastille: number | null
  rotation: number | null
  created_at: string
  updated_at: string | null
}

export interface Panne {
  id: number
  machine_id: number
  titre: string
  description: string | null
  causes_possibles: string[]
  cause_reelle: string | null
  solution: string | null
  protocole_reparation?: string | null
  criticite: number  // 1-5
  temps_moyen_reparation: number | null
  photos: string[]
  created_at: string
  updated_at: string | null
}

export interface Intervention {
  id: number
  machine_id: number
  panne_id: number | null
  technicien: string
  duree: number | null
  commentaire: string | null
  photos_avant: string[]
  photos_apres: string[]
  validee: boolean
  validee_par: string | null
  type_bt: string
  statut: string
  date_intervention: string | null
  created_at: string
}

export interface Convoyeur {
  id: number
  nom: string
  code_interne: string | null
  ligne: string | null
  zone: string | null
  etage: number | null
  type_convoyeur: string
  source_machine_id: number | null
  target_machine_id: number | null
  statut: string
  longueur_m: number | null
  vitesse: string | null
  path_points: { x: number; y: number }[]
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface Piece {
  id: number
  reference: string
  nom: string
  stock: number
  emplacement: string | null
  fournisseur: string | null
  description: string | null
  created_at: string
  updated_at: string | null
}

export interface MaintenancePreventive {
  id: number
  machine_id: number
  titre: string
  description: string | null
  frequence_jours: number
  derniere_execution: string | null
  responsable: string | null
  alert_jours: number
  actif: boolean
  created_at: string
  machine_nom?: string | null
  prochaine_echeance?: string | null
  statut?: 'ok' | 'bientot' | 'en_retard' | 'inconnu'
  jours_restants?: number | null
}

export interface Notification {
  id: number
  title: string
  message: string
  type: 'info' | 'majeure' | 'critique'
  entity_type: string | null
  entity_id: number | null
  created_at: string
  read?: boolean
}

export interface ActivityLog {
  id: number
  username: string
  user_role: string
  action: string
  entity_type: string | null
  entity_id: number | null
  entity_label: string | null
  created_at: string
}

export interface DashboardStats {
  total_machines: number
  total_pannes: number
  pannes_ouvertes: number
  interventions_total: number
  interventions_en_attente: number
  pieces_total: number
  pieces_stock_bas: number
  temps_moyen_reparation: number | null
}