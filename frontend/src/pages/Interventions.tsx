import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Search, X, Edit2, Trash2, CheckCircle, ChevronDown, PlayCircle, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

interface Intervention {
  id: number
  machine_id: number
  panne_id?: number
  technicien: string
  duree?: number
  commentaire?: string
  validee: boolean
  validee_par?: string
  type_bt: string
  statut: string
  date_intervention: string
}

const BT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  reparation: { label: 'Réparation', color: 'text-red-400 bg-red-900/30 border-red-800/50', icon: '🔧' },
  nettoyage: { label: 'Nettoyage', color: 'text-blue-400 bg-blue-900/30 border-blue-800/50', icon: '🧹' },
  entretien: { label: 'Entretien', color: 'text-green-400 bg-green-900/30 border-green-800/50', icon: '⚙️' },
}

const BT_STATUT_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  en_cours: { label: 'En cours', color: 'text-yellow-400', dot: 'bg-yellow-400' },
  termine: { label: 'Terminé', color: 'text-blue-400', dot: 'bg-blue-400' },
  valide: { label: 'Validé', color: 'text-green-400', dot: 'bg-green-400' },
}

const emptyForm = { machine_id: '', panne_id: '', technicien: '', duree: '', commentaire: '', date_intervention: '', type_bt: 'reparation' }

export default function Interventions() {
  const { user } = useAuth()
  const [interventions, setInterventions] = useState<Intervention[]>([])
  const [machines, setMachines] = useState<any[]>([])
  const [pannes, setPannes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterStatut, setFilterStatut] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Intervention | null>(null)
  const [form, setForm] = useState(emptyForm)

  const fetchAll = () => {
    let url = '/interventions/?limit=200'
    const params = new URLSearchParams()
    if (filterType) params.set('type_bt', filterType)
    if (filterStatut) params.set('statut', filterStatut)
    if (params.toString()) url += '&' + params.toString()
    Promise.all([api.get(url), api.get('/machines/'), api.get('/pannes/')]).then(([i, m, p]) => {
      setInterventions(i.data); setMachines(m.data); setPannes(p.data)
    }).finally(() => setLoading(false))
  }
  useEffect(() => { fetchAll() }, [filterType, filterStatut])

  const filtered = interventions.filter(i =>
    i.technicien.toLowerCase().includes(search.toLowerCase()) ||
    i.commentaire?.toLowerCase().includes(search.toLowerCase()) ||
    getMachineName(i.machine_id).toLowerCase().includes(search.toLowerCase())
  )

  const getMachineName = (id: number) => machines.find(m => m.id === id)?.nom || `#${id}`
  const getPanneTitre = (id?: number) => id ? pannes.find(p => p.id === id)?.titre || `#${id}` : '—'

  const openCreate = (prefill?: Partial<typeof emptyForm>) => {
    setForm({ ...emptyForm, date_intervention: new Date().toISOString().slice(0, 16), ...prefill })
    setEditing(null); setShowForm(true)
  }

  const handleDuplicate = (i: Intervention) => {
    openCreate({
      machine_id: String(i.machine_id),
      technicien: i.technicien,
      type_bt: i.type_bt || 'reparation',
      commentaire: `Duplication de l'intervention #${i.id}`,
    })
  }
  const openEdit = (i: Intervention) => {
    setForm({
      machine_id: String(i.machine_id),
      panne_id: i.panne_id ? String(i.panne_id) : '',
      technicien: i.technicien,
      duree: i.duree ? String(i.duree) : '',
      commentaire: i.commentaire || '',
      date_intervention: i.date_intervention ? new Date(i.date_intervention).toISOString().slice(0, 16) : '',
      type_bt: i.type_bt || 'reparation',
    })
    setEditing(i); setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      machine_id: Number(form.machine_id),
      panne_id: form.panne_id ? Number(form.panne_id) : null,
      technicien: form.technicien,
      duree: form.duree ? Number(form.duree) : null,
      commentaire: form.commentaire,
      date_intervention: form.date_intervention || null,
      type_bt: form.type_bt,
    }
    try {
      if (editing) { await api.put(`/interventions/${editing.id}`, payload); toast.success('BT mis à jour') }
      else { await api.post('/interventions/', payload); toast.success('BT créé') }
      setShowForm(false); fetchAll()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Erreur') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce bon de travail ?')) return
    try { await api.delete(`/interventions/${id}`); toast.success('Supprimé'); fetchAll() }
    catch { toast.error('Erreur') }
  }

  const handleValider = async (id: number) => {
    try { await api.post(`/interventions/${id}/valider`); toast.success('BT validé'); fetchAll() }
    catch (err: any) { toast.error(err.response?.data?.detail || 'Erreur') }
  }

  const handleTerminer = async (id: number) => {
    try { await api.post(`/interventions/${id}/terminer`); toast.success('BT marqué comme terminé'); fetchAll() }
    catch (err: any) { toast.error(err.response?.data?.detail || 'Erreur') }
  }

  const canEdit = user?.role === 'admin' || user?.role === 'manager'
  const canDuplicate = user?.role === 'technicien' || user?.role === 'manager'

  // Stats
  const stats = {
    total: interventions.length,
    enCours: interventions.filter(i => i.statut === 'en_cours').length,
    termines: interventions.filter(i => i.statut === 'termine').length,
    valides: interventions.filter(i => i.statut === 'valide').length,
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bons de Travail</h1>
          <p className="text-gray-400 text-sm mt-1">Interventions de réparation, nettoyage et entretien</p>
        </div>
        <button onClick={() => openCreate()} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Nouveau BT
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-400' },
          { label: 'En cours', value: stats.enCours, color: 'text-yellow-400' },
          { label: 'Terminés', value: stats.termines, color: 'text-blue-400' },
          { label: 'Validés', value: stats.valides, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par technicien, machine, commentaire..." className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div className="relative">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="appearance-none bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:border-orange-500">
            <option value="">Tous les types</option>
            {Object.entries(BT_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
            className="appearance-none bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:border-orange-500">
            <option value="">Tous les statuts</option>
            {Object.entries(BT_STATUT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Machine</th>
                <th className="text-left px-4 py-3">Technicien</th>
                <th className="text-left px-4 py-3">Durée</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center py-8 text-gray-500">Chargement...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-500">Aucun bon de travail</td></tr>
                : filtered.map(i => {
                  const typeConf = BT_TYPE_CONFIG[i.type_bt] || BT_TYPE_CONFIG.reparation
                  const statutConf = BT_STATUT_CONFIG[i.statut] || BT_STATUT_CONFIG.en_cours
                  return (
                    <tr key={i.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${typeConf.color}`}>
                          <span>{typeConf.icon}</span> {typeConf.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white">{getMachineName(i.machine_id)}</td>
                      <td className="px-4 py-3 text-gray-300">{i.technicien}</td>
                      <td className="px-4 py-3 text-gray-400">{i.duree ? `${i.duree} min` : '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(i.date_intervention).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1.5 text-xs ${statutConf.color}`}>
                          <span className={`w-2 h-2 rounded-full ${statutConf.dot}`} />
                          {statutConf.label}
                          {i.validee_par && <span className="text-gray-500">({i.validee_par})</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {i.statut === 'en_cours' && (
                            <button onClick={() => handleTerminer(i.id)} className="text-gray-400 hover:text-blue-400 transition-colors" title="Marquer terminé">
                              <PlayCircle size={15} />
                            </button>
                          )}
                          {canEdit && i.statut !== 'valide' && (
                            <button onClick={() => handleValider(i.id)} className="text-gray-400 hover:text-green-400 transition-colors" title="Valider">
                              <CheckCircle size={15} />
                            </button>
                          )}
                          {canDuplicate && (
                            <button onClick={() => handleDuplicate(i)} className="text-gray-400 hover:text-purple-400 transition-colors" title="Dupliquer">
                              <Copy size={15} />
                            </button>
                          )}
                          <button onClick={() => openEdit(i)} className="text-gray-400 hover:text-blue-400 transition-colors"><Edit2 size={15} /></button>
                          <button onClick={() => handleDelete(i.id)} className="text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 my-4 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">{editing ? 'Modifier le BT' : 'Nouveau Bon de Travail'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 hover:text-white" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Machine *</label>
                  <select value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))} required className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500">
                    <option value="">Sélectionner...</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Type de BT *</label>
                  <select value={form.type_bt} onChange={e => setForm(f => ({ ...f, type_bt: e.target.value }))} required className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500">
                    {Object.entries(BT_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Panne liée</label>
                <select value={form.panne_id} onChange={e => setForm(f => ({ ...f, panne_id: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500">
                  <option value="">Aucune</option>
                  {pannes.filter(p => !form.machine_id || p.machine_id === Number(form.machine_id)).map(p => <option key={p.id} value={p.id}>{p.titre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Technicien *</label>
                <input value={form.technicien} onChange={e => setForm(f => ({ ...f, technicien: e.target.value }))} required className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Durée (min)</label>
                  <input type="number" value={form.duree} onChange={e => setForm(f => ({ ...f, duree: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date</label>
                  <input type="datetime-local" value={form.date_intervention} onChange={e => setForm(f => ({ ...f, date_intervention: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Commentaire / Description du travail</label>
                <textarea value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Annuler</button>
                <button type="submit" className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">{editing ? 'Mettre à jour' : 'Créer le BT'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}