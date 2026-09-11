import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, LayoutGrid, Map, Plus, X, MapPin, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Machine {
  id: number
  nom: string
  ligne?: string
  zone?: string
  code_interne?: string
  statut: string
  pos_x?: number | null
  pos_y?: number | null
}

const statutDot: Record<string, string> = {
  operationnel: 'bg-green-500',
  en_panne: 'bg-red-500',
  maintenance: 'bg-yellow-500',
  arret: 'bg-gray-500',
}

const emptyForm = { nom: '', code_interne: '', zone: '' }

export default function LigneDetail() {
  const { ligne } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'schema' | 'arbre'>('schema')
  const [schemaAvailable, setSchemaAvailable] = useState(true)
  const [placing, setPlacing] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [hovered, setHovered] = useState<Machine | null>(null)
  const imgRef = useRef<HTMLDivElement>(null)

  const fetchMachines = () => {
    if (!ligne) return
    api.get(`/machines/?ligne=${encodeURIComponent(ligne)}`).then(r => setMachines(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchMachines(); setSchemaAvailable(true); setPlacing(null) }, [ligne])

  const schemaUrl = `/schemas/${encodeURIComponent(ligne || '')}.jpg`
  const placed = machines.filter(m => m.pos_x != null && m.pos_y != null)
  const unplaced = machines.filter(m => m.pos_x == null || m.pos_y == null)

  const zones = Array.from(new Set(machines.map(m => m.zone || 'Sans zone')))

  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (placing == null || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    try {
      await api.put(`/machines/${placing}`, { pos_x: Math.round(x * 100) / 100, pos_y: Math.round(y * 100) / 100 })
      toast.success('Machine placée sur le schéma')
      setPlacing(null)
      fetchMachines()
    } catch {
      toast.error('Erreur lors du placement')
    }
  }

  const handleUnplace = async (id: number) => {
    try {
      await api.put(`/machines/${id}`, { pos_x: null, pos_y: null })
      toast.success('Machine retirée du schéma')
      fetchMachines()
    } catch { toast.error('Erreur') }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/machines/', { ...form, ligne, statut: 'operationnel' })
      toast.success('Machine créée, cliquez sur le schéma pour la positionner')
      setShowForm(false)
      setForm(emptyForm)
      fetchMachines()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur, le code interne est peut-être déjà utilisé')
    }
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" /></div>

  return (
    <div className="p-6">
      <button onClick={() => navigate('/lignes')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 text-sm transition-colors">
        <ArrowLeft size={16} /> Retour aux lignes
      </button>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{ligne}</h1>
          <p className="text-gray-400 text-sm mt-1">{machines.length} machine{machines.length > 1 ? 's' : ''}</p>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> Ajouter une machine
            </button>
          )}
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-1">
            <button onClick={() => setView('schema')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'schema' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}>
              <Map size={14} /> Schéma
            </button>
            <button onClick={() => setView('arbre')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'arbre' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}>
              <LayoutGrid size={14} /> Arborescence
            </button>
          </div>
        </div>
      </div>

      {placing != null && (
        <div className="mb-3 flex items-center justify-between px-4 py-2.5 bg-orange-500/15 border border-orange-500/40 rounded-lg text-orange-300 text-sm">
          <span>Cliquez sur l'emplacement de la machine sur le schéma...</span>
          <button onClick={() => setPlacing(null)} className="text-orange-300 hover:text-white"><X size={16} /></button>
        </div>
      )}

      {view === 'schema' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            {schemaAvailable ? (
              <div
                ref={imgRef}
                onClick={handleImageClick}
                className={`relative w-full select-none ${placing != null ? 'cursor-crosshair' : ''}`}
              >
                <img
                  src={schemaUrl}
                  alt={`Schéma process ${ligne}`}
                  className="w-full h-auto block"
                  onError={() => setSchemaAvailable(false)}
                  draggable={false}
                />
                {placed.map(m => (
                  <div
                    key={m.id}
                    style={{ left: `${m.pos_x}%`, top: `${m.pos_y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group"
                    onMouseEnter={() => setHovered(m)}
                    onMouseLeave={() => setHovered(h => (h?.id === m.id ? null : h))}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!canEdit || placing == null) navigate(`/machines/${m.id}`) }}
                      className={`w-4 h-4 rounded-full ring-2 ring-white/80 shadow-lg ${statutDot[m.statut] || 'bg-gray-500'} hover:scale-150 transition-transform`}
                    />
                    {hovered?.id === m.id && (
                      <div className="absolute z-10 left-1/2 -translate-x-1/2 top-5 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                        <p className="text-white font-semibold">{m.nom}</p>
                        {m.code_interne && <p className="text-gray-400 font-mono">{m.code_interne}</p>}
                        <p className="text-gray-500">{m.zone}</p>
                        {canEdit && (
                          <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-gray-700">
                            <button onClick={(e) => { e.stopPropagation(); setPlacing(m.id) }} className="text-orange-400 hover:text-orange-300">Déplacer</button>
                            <button onClick={(e) => { e.stopPropagation(); handleUnplace(m.id) }} className="text-red-400 hover:text-red-300">Retirer</button>
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/machines/${m.id}`) }} className="text-gray-300 hover:text-white">Détails</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-10 text-center text-gray-500">
                <Map size={32} className="mx-auto mb-2 opacity-30" />
                <p>Aucun schéma disponible pour cette ligne pour le moment.</p>
              </div>
            )}
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 h-fit">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <MapPin size={14} className="text-orange-400" /> Machines non placées ({unplaced.length})
            </h3>
            {unplaced.length === 0 ? (
              <p className="text-xs text-gray-500">Toutes les machines sont positionnées sur le schéma.</p>
            ) : (
              <div className="space-y-2">
                {unplaced.map(m => (
                  <div key={m.id} className="p-2.5 bg-gray-700/40 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => navigate(`/machines/${m.id}`)} className="text-left text-sm text-white hover:text-orange-400 truncate">{m.nom}</button>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${statutDot[m.statut] || 'bg-gray-500'}`} />
                    </div>
                    {m.code_interne && <p className="text-xs text-gray-500 font-mono">{m.code_interne}</p>}
                    {canEdit && (
                      <button onClick={() => setPlacing(m.id)} className="text-xs text-orange-400 hover:text-orange-300 mt-1">Placer sur le schéma</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {zones.map(zone => {
            const zoneMachines = machines.filter(m => (m.zone || 'Sans zone') === zone)
            return (
              <div key={zone} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-700/40 border-b border-gray-700">
                  <h3 className="text-sm font-semibold text-white">{zone} <span className="text-gray-500 font-normal">({zoneMachines.length})</span></h3>
                </div>
                <div className="divide-y divide-gray-700">
                  {zoneMachines.map(m => (
                    <button key={m.id} onClick={() => navigate(`/machines/${m.id}`)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/30 transition-colors text-left">
                      <div>
                        <p className="text-white text-sm">{m.nom}</p>
                        {m.code_interne && <p className="text-xs text-gray-500 font-mono">{m.code_interne}</p>}
                      </div>
                      <span className={`flex items-center gap-1.5 text-xs ${m.statut === 'en_panne' ? 'text-red-400' : 'text-gray-400'}`}>
                        {m.statut === 'en_panne' && <AlertTriangle size={12} />}
                        <span className={`w-2 h-2 rounded-full ${statutDot[m.statut] || 'bg-gray-500'}`} />
                        {m.statut?.replace('_', ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Nouvelle machine — {ligne}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nom</label>
                <input required value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Code interne (exactement comme sur le schéma, ex: B1A0)</label>
                <input value={form.code_interne} onChange={e => setForm({ ...form, code_interne: e.target.value })} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Zone</label>
                <input value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} placeholder="ex: Halle de tri automatique" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <button type="submit" className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors mt-2">
                Créer
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
