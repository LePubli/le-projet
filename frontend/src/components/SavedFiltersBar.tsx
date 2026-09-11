/**
 * SavedFiltersBar — barre de filtres sauvegardés réutilisable.
 *
 * Props:
 *   - entity: identifiant d'entité ("pannes", "bons-travail", ...)
 *   - currentFilters: objet des filtres actuellement actifs (pour sauvegarde)
 *   - onApply: callback(filters) quand un filtre sauvegardé est chargé
 */
import { useEffect, useState } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { Bookmark, Trash2, Plus, X } from 'lucide-react'

interface SavedFilter {
  id: number
  name: string
  entity: string
  filters: Record<string, unknown>
  created_at?: string
}

interface Props {
  entity: string
  currentFilters: Record<string, unknown>
  onApply: (filters: Record<string, unknown>) => void
}

export default function SavedFiltersBar({ entity, currentFilters, onApply }: Props) {
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [loading, setLoading] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newName, setNewName] = useState('')

  const fetchFilters = () => {
    api.get(`/saved-filters/?entity=${entity}`).then(r => setFilters(r.data)).catch(() => {})
  }

  useEffect(() => { fetchFilters() }, [entity])

  const handleSave = async () => {
    if (!newName.trim()) return
    setLoading(true)
    try {
      await api.post('/saved-filters/', {
        name: newName.trim(),
        entity,
        filters: currentFilters,
      })
      toast.success('Filtre sauvegardé')
      setNewName('')
      setShowSaveDialog(false)
      fetchFilters()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer le filtre « ${name} » ?`)) return
    try {
      await api.delete(`/saved-filters/${id}`)
      toast.success('Filtre supprimé')
      fetchFilters()
    } catch {
      toast.error('Erreur')
    }
  }

  const handleApply = (sf: SavedFilter) => {
    onApply(sf.filters)
    toast.success(`Filtre « ${sf.name} » appliqué`)
  }

  // Check if current filters are non-empty (to allow saving)
  const hasActiveFilters = Object.values(currentFilters).some(v =>
    v !== '' && v !== null && v !== undefined && (typeof v !== 'object' || Object.keys(v).length > 0)
  )

  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
        <Bookmark size={12} /> Filtres:
      </span>

      {filters.map(sf => (
        <div key={sf.id} className="flex items-center gap-1 bg-gray-700/50 border border-gray-600 rounded-lg pl-2.5 pr-1 py-1 group">
          <button
            onClick={() => handleApply(sf)}
            className="text-xs text-gray-300 hover:text-white transition-colors"
            title={`Appliquer: ${JSON.stringify(sf.filters)}`}
          >
            {sf.name}
          </button>
          <button
            onClick={() => handleDelete(sf.id, sf.name)}
            className="p-0.5 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            title="Supprimer"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}

      {filters.length === 0 && !showSaveDialog && (
        <span className="text-xs text-gray-600 italic">Aucun filtre sauvegardé</span>
      )}

      {/* Save new filter button / dialog */}
      {showSaveDialog ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Nom du filtre..."
            autoFocus
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs w-36 focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={handleSave}
            disabled={loading || !newName.trim()}
            className="px-2 py-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs transition-colors"
          >
            OK
          </button>
          <button
            onClick={() => { setShowSaveDialog(false); setNewName('') }}
            className="p-1 text-gray-400 hover:text-white"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        hasActiveFilters && (
          <button
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-1 px-2 py-1 bg-gray-700/30 border border-dashed border-gray-600 hover:border-orange-500 text-gray-400 hover:text-orange-400 rounded-lg text-xs transition-colors"
            title="Sauvegarder les filtres actuels"
          >
            <Plus size={11} /> Sauvegarder
          </button>
        )
      )}
    </div>
  )
}
