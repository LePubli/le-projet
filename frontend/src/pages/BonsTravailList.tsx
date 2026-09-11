/* frontend/src/pages/BonsTravailList.tsx — Liste réutilisable pour Entretien / Nettoyage
   Props : typeBt ("entretien"|"nettoyage"), title, color, icon
*/
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import ImportExportDialog from '../components/ImportExportDialog'
import SavedFiltersBar from '../components/SavedFiltersBar'
import {
  Plus, Search, Filter, Clock, CheckCircle2, AlertCircle,
  ClipboardList, Sparkles, ChevronDown, Upload
} from 'lucide-react'

interface BTItem {
  id: number; numero: string; type_bt: string; statut: string; titre: string
  machine_id: number | null; machine_nom: string | null
  degre_urgence: string | null; date_creation: string | null
  date_debut_prevue: string | null; date_cloture: string | null
  demandeur_nom: string | null; intervenant_nom: string | null
  gammes_total: number; gammes_faites: number
}

interface BTStats { total: number; a_faire: number; en_cours: number; termine: number; cloture: number }

const STATUT_COLORS: Record<string, string> = {
  'à faire': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'en cours': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'terminé': 'bg-green-500/15 text-green-400 border-green-500/30',
  'clôturé': 'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

const STATUT_DOT: Record<string, string> = {
  'à faire': 'bg-yellow-500', 'en cours': 'bg-blue-500',
  'terminé': 'bg-green-500', 'clôturé': 'bg-gray-500',
}

const URGENCE_COLORS: Record<string, string> = {
  urgente: 'bg-red-500/15 text-red-400',
  haute: 'bg-orange-500/15 text-orange-400',
  normale: 'bg-blue-500/15 text-blue-400',
  basse: 'bg-gray-500/15 text-gray-400',
}

const ACCENT: Record<string, { bg: string; text: string; border: string; btn: string }> = {
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', btn: 'bg-blue-600 hover:bg-blue-700' },
  green: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', btn: 'bg-emerald-600 hover:bg-emerald-700' },
}

interface Props {
  typeBt: string
  title: string
  icon: string
  color: 'blue' | 'green'
}

export default function BonsTravailList({ typeBt, title, color }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<BTItem[]>([])
  const [stats, setStats] = useState<BTStats>({ total: 0, a_faire: 0, en_cours: 0, termine: 0, cloture: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const accent = ACCENT[color] || ACCENT.blue

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = { type_bt: typeBt, limit: '200' }
      if (statutFilter) params.statut = statutFilter
      if (search) params.search = search
      const [listRes, statsRes] = await Promise.all([
        api.get('/bons-travail/', { params }),
        api.get('/bons-travail/stats', { params: { type_bt: typeBt } }),
      ])
      setData(listRes.data)
      setStats(statsRes.data)
    } catch { toast.error('Erreur chargement des BT') }
    finally { setLoading(false) }
  }, [typeBt, statutFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${accent.bg} flex items-center justify-center`}>
            {color === 'green' ? <Sparkles size={20} className={accent.text} /> : <ClipboardList size={20} className={accent.text} />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{title}</h1>
            <p className="text-xs text-gray-500">Bons de Travail</p>
          </div>
        </div>
        {(user?.role === 'admin' || user?.role === 'manager' || user?.role === 'chef_equipe') && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowImportExport(true)}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors">
              <Upload size={16} /> Import / Export
            </button>
            <button onClick={() => navigate(`/bons-travail/new?type=${typeBt}`)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-colors ${accent.btn}`}>
              <Plus size={18} /> Nouveau BT
            </button>
          </div>
        )}
      </div>

      {/* Saved filters */}
      <SavedFiltersBar
        entity={typeBt}
        currentFilters={{ search, statut: statutFilter }}
        onApply={(f) => {
          setSearch((f.search as string) || '')
          setStatutFilter((f.statut as string) || '')
        }}
      />

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'À faire', value: stats.a_faire, icon: Clock, color: 'text-yellow-400' },
          { label: 'En cours', value: stats.en_cours, icon: AlertCircle, color: 'text-blue-400' },
          { label: 'Terminé', value: stats.termine, icon: CheckCircle2, color: 'text-green-400' },
          { label: 'Clôturé', value: stats.cloture, icon: ClipboardList, color: 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{s.label}</span>
              <s.icon size={14} className={s.color} />
            </div>
            <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par numéro, titre..."
            className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-colors ${showFilters ? 'border-blue-500 text-blue-400 bg-blue-500/10' : 'border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
          <Filter size={16} /> Statut <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2">
          {['', 'à faire', 'en cours', 'terminé', 'clôturé'].map(s => (
            <button key={s} onClick={() => setStatutFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statutFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              {s || 'Tous'}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {data.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ClipboardList size={48} className="mx-auto mb-3 opacity-30" />
          <p>Aucun bon de travail {statutFilter ? `avec statut "${statutFilter}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map(bt => (
            <button key={bt.id} onClick={() => navigate(`/bons-travail/${bt.id}`)}
              className="w-full text-left bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 hover:bg-gray-800 hover:border-gray-600 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-500">{bt.numero}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUT_COLORS[bt.statut] || STATUT_COLORS['à faire']}`}>
                      {bt.statut}
                    </span>
                    {bt.degre_urgence && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${URGENCE_COLORS[bt.degre_urgence] || ''}`}>
                        {bt.degre_urgence}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-white mt-1 truncate">{bt.titre}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                    {bt.machine_nom && <span>🔧 {bt.machine_nom}</span>}
                    {bt.demandeur_nom && <span>👤 {bt.demandeur_nom}</span>}
                    <span>📅 {formatDate(bt.date_debut_prevue)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {bt.gammes_total > 0 && (
                    <div className="text-xs text-gray-500">
                      {bt.gammes_faites}/{bt.gammes_total}
                      <div className="w-16 h-1.5 bg-gray-700 rounded-full mt-1">
                        <div className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${(bt.gammes_faites / bt.gammes_total) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Import / Export Dialog */}
      {showImportExport && (
        <ImportExportDialog
          entity={typeBt}
          label={title}
          onClose={() => setShowImportExport(false)}
          onImported={fetchData}
        />
      )}
    </div>
  )
}