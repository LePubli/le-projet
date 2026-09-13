import { useEffect, useState, useMemo, useCallback, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import MediaUploader, { type MediaItem } from '../components/MediaUploader'
import toast from 'react-hot-toast'
import {
  Search, BookOpen, AlertTriangle, Wrench, Clock, ChevronRight,
  Filter, X, CheckCircle2, HelpCircle, Plus, Pencil, Trash2, Save, XCircle
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────
interface KnowledgeEntry {
  id: number; machine_id: number; machine_nom: string | null
  titre: string; description: string | null; cause_reelle: string | null
  solution: string | null; protocole_reparation: string | null
  criticite: number; temps_moyen_reparation: number | null
  causes_possibles: string[]; updated_at: string | null
  cause_medias?: MediaItem[]; solution_medias?: MediaItem[]
}

interface MachineOption {
  id: number; nom: string; ligne: string | null
}

interface FormData {
  machine_id: string
  titre: string
  description: string
  criticite: string
  causes_possibles: string
  cause_reelle: string
  solution: string
  protocole_reparation: string
  temps_moyen_reparation: string
  cause_medias: MediaItem[]
  solution_medias: MediaItem[]
}

const EMPTY_FORM: FormData = {
  machine_id: '', titre: '', description: '', criticite: '3',
  causes_possibles: '', cause_reelle: '', solution: '',
  protocole_reparation: '', temps_moyen_reparation: '',
  cause_medias: [], solution_medias: [],
}

// ─── Constants ────────────────────────────────────────────────────
const CRITICITE_CONFIG: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: 'Très faible', color: 'text-green-400', bg: 'bg-green-900/30 border-green-800/50' },
  2: { label: 'Faible', color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-800/50' },
  3: { label: 'Moyen', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-800/50' },
  4: { label: 'Élevé', color: 'text-orange-400', bg: 'bg-orange-900/30 border-orange-800/50' },
  5: { label: 'Critique', color: 'text-red-400', bg: 'bg-red-900/30 border-red-800/50' },
}

// ─── Modal state (create/edit) ──────────────────────────────────────
interface ModalState {
  open: boolean
  editingEntry: KnowledgeEntry | null
  form: FormData
  saving: boolean
}

const initialModalState: ModalState = {
  open: false,
  editingEntry: null,
  form: EMPTY_FORM,
  saving: false,
}

type ModalAction =
  | { type: 'OPEN_CREATE' }
  | { type: 'OPEN_EDIT'; entry: KnowledgeEntry; form: FormData }
  | { type: 'CLOSE' }
  | { type: 'UPDATE_FORM'; updater: (f: FormData) => FormData }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_END' }

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_CREATE':
      return { open: true, editingEntry: null, form: EMPTY_FORM, saving: false }
    case 'OPEN_EDIT':
      return { open: true, editingEntry: action.entry, form: action.form, saving: false }
    case 'CLOSE':
      return { open: false, editingEntry: null, form: EMPTY_FORM, saving: false }
    case 'UPDATE_FORM':
      return { ...state, form: action.updater(state.form) }
    case 'SAVE_START':
      return { ...state, saving: true }
    case 'SAVE_END':
      return { ...state, saving: false }
    default:
      return state
  }
}

// ─── Media field (lecture seule ou éditable) ────────────────────────
function MediaField({
  medias, canEdit, label, onChange,
}: {
  medias: MediaItem[]
  canEdit: boolean
  label: string
  onChange?: (m: MediaItem[]) => void
}) {
  if (!canEdit && medias.length === 0) return null
  const uploader = <MediaUploader medias={medias} canEdit={canEdit} label={label} size="sm" onChange={onChange} />
  return canEdit ? <div className="mt-2">{uploader}</div> : uploader
}

export default function BaseConnaissances() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'manager'
  const isAdmin = user?.role === 'admin'

  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [machines, setMachines] = useState<MachineOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null)
  const [criticiteMin, setCriticiteMin] = useState<number | null>(null)
  const [criticiteMax, setCriticiteMax] = useState<number | null>(null)
  const [avecSolution, setAvecSolution] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // ─── Modal state ────────────────────────────────────────────────
  const [modal, dispatchModal] = useReducer(modalReducer, initialModalState)
  const { open: modalOpen, editingEntry, form, saving } = modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  // ─── Fetch ──────────────────────────────────────────────────────
  const fetchEntries = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (searchQuery) params.set('q', searchQuery)
    if (selectedMachine) params.set('machine_id', String(selectedMachine))
    if (criticiteMin !== null) params.set('criticite_min', String(criticiteMin))
    if (criticiteMax !== null) params.set('criticite_max', String(criticiteMax))
    if (avecSolution) params.set('avec_solution', 'true')

    api.get(`/base-connaissances/?${params.toString()}`)
      .then(r => setEntries(r.data))
      .finally(() => setLoading(false))
  }, [searchQuery, selectedMachine, criticiteMin, criticiteMax, avecSolution])

  useEffect(() => {
    api.get('/machines/?limit=500').then(r => setMachines(r.data))
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // ─── Stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: entries.length,
    avecSolution: entries.filter(e => e.solution).length,
    critiques: entries.filter(e => e.criticite >= 4).length,
    tempsMoyen: entries.length > 0
      ? Math.round(entries.reduce((acc, e) => acc + (e.temps_moyen_reparation || 0), 0) / entries.length)
      : 0,
  }), [entries])

  // ─── Helpers ────────────────────────────────────────────────────
  const highlightText = (text: string | null, query: string) => {
    if (!text || !query) return text || ''
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-orange-500/30 text-orange-300 rounded px-0.5">{part}</mark> : part
    )
  }

  const clearFilters = () => {
    setSearchQuery(''); setSelectedMachine(null)
    setCriticiteMin(null); setCriticiteMax(null); setAvecSolution(false)
  }

  const hasActiveFilters = searchQuery || selectedMachine || criticiteMin !== null || criticiteMax !== null || avecSolution

  // ─── Modal helpers ──────────────────────────────────────────────
  const openCreate = () => {
    dispatchModal({ type: 'OPEN_CREATE' })
  }

  const openEdit = (entry: KnowledgeEntry) => {
    dispatchModal({
      type: 'OPEN_EDIT',
      entry,
      form: {
        machine_id: String(entry.machine_id),
        titre: entry.titre,
        description: entry.description || '',
        criticite: String(entry.criticite),
        causes_possibles: (entry.causes_possibles || []).join(', '),
        cause_reelle: entry.cause_reelle || '',
        solution: entry.solution || '',
        protocole_reparation: entry.protocole_reparation || '',
        temps_moyen_reparation: entry.temps_moyen_reparation != null ? String(entry.temps_moyen_reparation) : '',
        cause_medias: entry.cause_medias || [],
        solution_medias: entry.solution_medias || [],
      },
    })
  }

  const closeModal = () => {
    dispatchModal({ type: 'CLOSE' })
  }

  const handleSave = async () => {
    if (!form.machine_id || !form.titre.trim() || !form.cause_reelle.trim() || !form.solution.trim()) {
      toast.error('Veuillez remplir les champs obligatoires (Machine, Titre, Cause réelle, Solution)')
      return
    }

    dispatchModal({ type: 'SAVE_START' })
    try {
      const causesArray = form.causes_possibles
        ? form.causes_possibles.split(',').map(c => c.trim()).filter(Boolean)
        : []

      if (editingEntry) {
        // PUT - update
        const payload: Record<string, unknown> = {
          solution: form.solution,
          cause_reelle: form.cause_reelle,
          protocole_reparation: form.protocole_reparation || null,
          causes_possibles: causesArray,
          criticite: Number(form.criticite),
          temps_moyen_reparation: form.temps_moyen_reparation ? Number(form.temps_moyen_reparation) : null,
          cause_medias: form.cause_medias,
          solution_medias: form.solution_medias,
        }
        await api.put(`/base-connaissances/${editingEntry.id}`, payload)
        toast.success('Connaissance modifiée avec succès')
      } else {
        // POST - create
        const payload = {
          machine_id: Number(form.machine_id),
          titre: form.titre,
          description: form.description || null,
          cause_reelle: form.cause_reelle,
          solution: form.solution,
          protocole_reparation: form.protocole_reparation || null,
          criticite: Number(form.criticite),
          temps_moyen_reparation: form.temps_moyen_reparation ? Number(form.temps_moyen_reparation) : null,
          causes_possibles: causesArray,
          cause_medias: form.cause_medias,
          solution_medias: form.solution_medias,
        }
        await api.post('/base-connaissances/', payload)
        toast.success('Connaissance créée avec succès')
      }
      closeModal()
      fetchEntries()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement'
      toast.error(message)
    } finally {
      dispatchModal({ type: 'SAVE_END' })
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/base-connaissances/${id}`)
      toast.success('Connaissance supprimée')
      setDeleteConfirmId(null)
      if (expandedId === id) setExpandedId(null)
      fetchEntries()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression'
      toast.error(message)
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────
  const inputClass = 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500'
  const labelClass = 'text-xs text-gray-400 mb-1 block font-medium'

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto pb-24 sm:pb-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <BookOpen size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Base de Connaissances</h1>
              <p className="text-gray-400 text-sm">Consultez les pannes résolues et leurs solutions pour intervenir rapidement</p>
            </div>
          </div>
          {canEdit && (
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-orange-500/20">
              <Plus size={16} /> Ajouter une connaissance
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Résultats', value: stats.total, icon: Search, color: 'text-gray-400' },
          { label: 'Avec solution', value: stats.avecSolution, icon: CheckCircle2, color: 'text-green-400' },
          { label: 'Critiques', value: stats.critiques, icon: AlertTriangle, color: 'text-red-400' },
          { label: 'Temps moyen', value: `${stats.tempsMoyen} min`, icon: Clock, color: 'text-blue-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Icon size={12} /> {label}
            </div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher par titre, symptôme, cause, solution..."
              className="w-full pl-9 pr-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white'
            }`}>
            <Filter size={14} /> Filtres
            {hasActiveFilters && <span className="w-2 h-2 bg-orange-400 rounded-full" />}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-700">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Machine</label>
              <select value={selectedMachine || ''} onChange={e => setSelectedMachine(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500">
                <option value="">Toutes les machines</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.nom}{m.ligne ? ` (${m.ligne})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Criticité min</label>
              <select value={criticiteMin ?? ''} onChange={e => setCriticiteMin(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500">
                <option value="">Toutes</option>
                {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v} — {CRITICITE_CONFIG[v].label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Criticité max</label>
              <select value={criticiteMax ?? ''} onChange={e => setCriticiteMax(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500">
                <option value="">Toutes</option>
                {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v} — {CRITICITE_CONFIG[v].label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer pb-2">
                <input type="checkbox" checked={avecSolution} onChange={e => setAvecSolution(e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-orange-500 focus:ring-orange-500 focus:ring-offset-0" />
                Avec solution uniquement
              </label>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="px-3 py-2 text-xs text-red-400 hover:text-red-300 border border-red-800/50 rounded-lg">
                  Effacer
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">Aucun résultat trouvé</p>
          <p className="text-sm mt-1">Modifiez vos critères de recherche ou <button onClick={clearFilters} className="text-orange-400 hover:underline">effacez les filtres</button></p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => {
            const crit = CRITICITE_CONFIG[entry.criticite] || CRITICITE_CONFIG[3]
            const isExpanded = expandedId === entry.id
            const hasSolution = !!entry.solution
            return (
              <div key={entry.id} className={`bg-gray-800 border rounded-xl overflow-hidden transition-colors ${isExpanded ? 'border-orange-500/50' : 'border-gray-700 hover:border-gray-600'}`}>
                {/* Card header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full text-left p-4 flex items-start gap-4"
                >
                  {/* Criticite badge */}
                  <div className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${crit.bg}`}>
                    <span className={`text-sm font-bold ${crit.color}`}>{entry.criticite}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-white font-semibold text-sm">{highlightText(entry.titre, searchQuery)}</h3>
                      {hasSolution && <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full"><CheckCircle2 size={10} /> Résolu</span>}
                      {!hasSolution && <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded-full"><HelpCircle size={10} /> Sans solution</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {entry.machine_nom && (
                        <button onClick={e => { e.stopPropagation(); navigate(`/machines/${entry.machine_id}`) }}
                          className="hover:text-orange-400 transition-colors">{entry.machine_nom}</button>
                      )}
                      {entry.temps_moyen_reparation && (
                        <span className="flex items-center gap-1"><Clock size={10} /> {entry.temps_moyen_reparation} min</span>
                      )}
                      {entry.updated_at && <span>Modifié le {new Date(entry.updated_at).toLocaleDateString('fr-FR')}</span>}
                    </div>
                    {entry.description && !isExpanded && (
                      <p className="text-gray-400 text-xs mt-1.5 line-clamp-1">{entry.description}</p>
                    )}
                  </div>

                  <ChevronRight size={16} className={`text-gray-500 shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {/* Diagnostic */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertTriangle size={12} className="text-yellow-400" /> Diagnostic
                        </h4>
                        {entry.causes_possibles?.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Causes possibles :</p>
                            <ul className="space-y-1">
                              {entry.causes_possibles.map((c, i) => (
                                <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                                  <span className="text-gray-600 mt-0.5">•</span> {highlightText(c, searchQuery)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {entry.cause_reelle && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Cause réelle :</p>
                            <p className="text-sm text-yellow-300 bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-2">
                              {highlightText(entry.cause_reelle, searchQuery)}
                            </p>
                          </div>
                        )}
                        <MediaField medias={entry.cause_medias || []} canEdit={false} label="Médias de la cause" />
                      </div>

                      {/* Solution */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Wrench size={12} className="text-green-400" /> Solution
                        </h4>
                        {entry.solution ? (
                          <div className="bg-green-900/15 border border-green-800/30 rounded-lg p-3">
                            <p className="text-sm text-green-200 whitespace-pre-wrap">{highlightText(entry.solution, searchQuery)}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-600 italic">Aucune solution documentée</p>
                        )}
                        <MediaField medias={entry.solution_medias || []} canEdit={false} label="Médias de la solution" />
                      </div>
                    </div>

                    {/* Protocol */}
                    {entry.protocole_reparation && (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                          <BookOpen size={12} className="text-blue-400" /> Protocole de réparation
                        </h4>
                        <div className="bg-blue-900/15 border border-blue-800/30 rounded-lg p-4">
                          <div className="text-sm text-blue-100 whitespace-pre-wrap leading-relaxed">
                            {entry.protocole_reparation.split('\n').map((line, i) => {
                              const trimmed = line.trim()
                              if (!trimmed) return <br key={i} />
                              // Numbered steps
                              const stepMatch = trimmed.match(/^(\d+)[).]\s*(.*)/)
                              if (stepMatch) {
                                return (
                                  <div key={i} className="flex items-start gap-2 mb-1.5">
                                    <span className="shrink-0 w-6 h-6 bg-blue-600/30 text-blue-300 rounded-full flex items-center justify-center text-xs font-bold">
                                      {stepMatch[1]}
                                    </span>
                                    <span>{highlightText(stepMatch[2], searchQuery)}</span>
                                  </div>
                                )
                              }
                              // Bullet points
                              if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•')) {
                                return (
                                  <div key={i} className="flex items-start gap-2 mb-1 ml-2">
                                    <span className="text-blue-500">›</span>
                                    <span>{highlightText(trimmed.replace(/^[-*•]\s*/, ''), searchQuery)}</span>
                                  </div>
                                )
                              }
                              return <p key={i} className="mb-1">{highlightText(trimmed, searchQuery)}</p>
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-700">
                      <button onClick={() => navigate(`/pannes/${entry.id}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors">
                        Voir la panne complète <ChevronRight size={12} />
                      </button>
                      {canEdit && (
                        <button onClick={() => openEdit(entry)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-blue-400 border border-gray-600 rounded-lg text-xs font-medium transition-colors">
                          <Pencil size={12} /> Modifier
                        </button>
                      )}
                      {isAdmin && (
                        deleteConfirmId === entry.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400">Supprimer cette connaissance ?</span>
                            <button onClick={() => handleDelete(entry.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors">
                              <Trash2 size={12} /> Oui, supprimer
                            </button>
                            <button onClick={() => setDeleteConfirmId(null)}
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-medium transition-colors">
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(entry.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-red-400 border border-gray-600 rounded-lg text-xs font-medium transition-colors">
                            <Trash2 size={12} /> Supprimer
                          </button>
                        )
                      )}
                      {entry.machine_nom && (
                        <button onClick={() => navigate(`/machines/${entry.machine_id}`)}
                          className="text-xs text-gray-400 hover:text-white transition-colors">
                          Voir la machine →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Create / Edit Modal ──────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />

          {/* Modal — bottom sheet on mobile, centered dialog on desktop */}
          <div className="relative bg-gray-800 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            {/* Modal header sticky */}
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between rounded-t-2xl z-10 shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {editingEntry ? <Pencil size={18} className="text-blue-400" /> : <Plus size={18} className="text-orange-400" />}
                {editingEntry ? 'Modifier la connaissance' : 'Nouvelle connaissance'}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-white transition-colors">
                <XCircle size={20} />
              </button>
            </div>

            {/* Modal body — scrollable */}
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {/* Machine + Criticité row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Machine <span className="text-red-400">*</span></label>
                  <select
                    value={form.machine_id}
                    onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, machine_id: e.target.value }) })}
                    className={inputClass}
                    disabled={!!editingEntry}
                  >
                    <option value="">Sélectionner une machine</option>
                    {machines.map(m => (
                      <option key={m.id} value={m.id}>{m.nom}{m.ligne ? ` (${m.ligne})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Criticité</label>
                  <select
                    value={form.criticite}
                    onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, criticite: e.target.value }) })}
                    className={inputClass}
                  >
                    {[1, 2, 3, 4, 5].map(v => (
                      <option key={v} value={v}>{v} — {CRITICITE_CONFIG[v].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Titre */}
              <div>
                <label className={labelClass}>Titre <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.titre}
                  onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, titre: e.target.value }) })}
                  className={inputClass}
                  placeholder="Titre de la panne / connaissance"
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, description: e.target.value }) })}
                  className={`${inputClass} min-h-[80px] resize-y`}
                  placeholder="Description détaillée du problème..."
                />
              </div>

              {/* Causes possibles */}
              <div>
                <label className={labelClass}>Causes possibles <span className="text-gray-500 font-normal">(séparées par des virgules)</span></label>
                <input
                  type="text"
                  value={form.causes_possibles}
                  onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, causes_possibles: e.target.value }) })}
                  className={inputClass}
                  placeholder="Usure roulement, manque de lubrifiant, surchauffe..."
                />
              </div>

              {/* Cause réelle */}
              <div>
                <label className={labelClass}>Cause réelle <span className="text-red-400">*</span></label>
                <textarea
                  value={form.cause_reelle}
                  onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, cause_reelle: e.target.value }) })}
                  className={`${inputClass} min-h-[80px] resize-y`}
                  placeholder="Cause identifiée après diagnostic..."
                />
                <MediaField
                  medias={form.cause_medias}
                  canEdit={true}
                  label="Médias de la cause (photos / vidéos)"
                  onChange={(m) => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, cause_medias: m }) })}
                />
              </div>

              {/* Solution */}
              <div>
                <label className={labelClass}>Solution <span className="text-red-400">*</span></label>
                <textarea
                  value={form.solution}
                  onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, solution: e.target.value }) })}
                  className={`${inputClass} min-h-[100px] resize-y`}
                  placeholder="Solution appliquée pour résoudre le problème..."
                />
                <MediaField
                  medias={form.solution_medias}
                  canEdit={true}
                  label="Médias de la solution (photos / vidéos)"
                  onChange={(m) => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, solution_medias: m }) })}
                />
              </div>

              {/* Protocole de réparation */}
              <div>
                <label className={labelClass}>Protocole de réparation</label>
                <textarea
                  value={form.protocole_reparation}
                  onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, protocole_reparation: e.target.value }) })}
                  className={`${inputClass} min-h-[100px] resize-y`}
                  placeholder="1. Éteindre la machine&#10;2. Démonter le capot&#10;3. Remplacer la pièce..."
                />
              </div>

              {/* Temps moyen */}
              <div className="max-w-xs">
                <label className={labelClass}>Temps moyen de réparation <span className="text-gray-500 font-normal">(minutes)</span></label>
                <input
                  type="number"
                  min="0"
                  value={form.temps_moyen_reparation}
                  onChange={e => dispatchModal({ type: 'UPDATE_FORM', updater: f => ({ ...f, temps_moyen_reparation: e.target.value }) })}
                  className={inputClass}
                  placeholder="30"
                />
              </div>
            </div>

            {/* Modal footer sticky */}
            <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-end gap-3 rounded-b-2xl shrink-0">
              <button onClick={closeModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors">
                <X size={14} /> Annuler
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
                <Save size={14} /> {saving ? 'Enregistrement...' : editingEntry ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}