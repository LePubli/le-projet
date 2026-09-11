import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import { Wrench, Plus, Edit2, Trash2, CheckCircle, X, AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

interface Maintenance {
  id: number
  machine_id: number
  machine_nom: string | null
  titre: string
  description: string | null
  frequence_jours: number
  responsable: string | null
  alert_jours: number
  actif: boolean
  derniere_execution: string | null
  prochaine_echeance: string | null
  statut: string
  jours_restants: number | null
  created_at: string
}

const statutConfig = {
  en_retard: { bg: 'bg-red-900/30 border-red-700', badge: 'bg-red-900/60 text-red-300 border-red-700', label: 'En retard', icon: AlertTriangle, bar: 'bg-red-500' },
  bientot:   { bg: 'bg-orange-900/20 border-orange-700', badge: 'bg-orange-900/60 text-orange-300 border-orange-700', label: 'Bientôt', icon: Clock, bar: 'bg-orange-400' },
  ok:        { bg: 'bg-gray-800 border-gray-700', badge: 'bg-green-900/40 text-green-300 border-green-700', label: 'OK', icon: CheckCircle, bar: 'bg-green-500' },
  inconnu:   { bg: 'bg-gray-800 border-gray-700', badge: 'bg-gray-700 text-gray-400 border-gray-600', label: '—', icon: Clock, bar: 'bg-gray-600' },
}

const emptyForm = { machine_id: '', titre: '', description: '', frequence_jours: '30', responsable: '', alert_jours: '7', actif: true }

function progressPercent(mp: Maintenance): number {
  if (!mp.prochaine_echeance || !mp.derniere_execution) return 100
  const start = new Date(mp.derniere_execution).getTime()
  const end = new Date(mp.prochaine_echeance).getTime()
  const now = Date.now()
  if (end <= start) return 100
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
}

export default function MaintenancePreventivePage() {
  const [items, setItems] = useState<Maintenance[]>([])
  const [machines, setMachines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Maintenance | null>(null)
  const [form, setForm] = useState(emptyForm)

  const fetchData = useCallback(() => {
    Promise.all([
      api.get('/maintenance-preventive/'),
      api.get('/machines/'),
    ]).then(([mp, m]) => {
      setItems(mp.data)
      setMachines(m.data)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openEdit = (mp: Maintenance) => {
    setEditItem(mp)
    setForm({
      machine_id: String(mp.machine_id),
      titre: mp.titre,
      description: mp.description || '',
      frequence_jours: String(mp.frequence_jours),
      responsable: mp.responsable || '',
      alert_jours: String(mp.alert_jours),
      actif: mp.actif,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      machine_id: Number(form.machine_id),
      titre: form.titre,
      description: form.description || null,
      frequence_jours: Number(form.frequence_jours),
      responsable: form.responsable || null,
      alert_jours: Number(form.alert_jours),
      actif: form.actif,
    }
    try {
      if (editItem) {
        await api.put(`/maintenance-preventive/${editItem.id}`, payload)
        toast.success('Plan mis à jour')
        setEditItem(null)
      } else {
        await api.post('/maintenance-preventive/', payload)
        toast.success('Plan créé')
        setShowCreate(false)
      }
      setForm(emptyForm)
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur')
    }
  }

  const marquerEffectue = async (mp: Maintenance) => {
    try {
      await api.post(`/maintenance-preventive/${mp.id}/effectuer`)
      toast.success(`"${mp.titre}" marquée comme effectuée`)
      fetchData()
    } catch { toast.error('Erreur') }
  }

  const handleDelete = async (mp: Maintenance) => {
    if (!confirm(`Supprimer le plan "${mp.titre}" ?`)) return
    try {
      await api.delete(`/maintenance-preventive/${mp.id}`)
      toast.success('Plan supprimé')
      fetchData()
    } catch { toast.error('Erreur') }
  }

  const retard = items.filter(i => i.statut === 'en_retard').length
  const bientot = items.filter(i => i.statut === 'bientot').length
  const ok = items.filter(i => i.statut === 'ok').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <RefreshCw size={22} className="text-orange-500" />
            Maintenance préventive
          </h1>
          <p className="text-gray-400 text-sm mt-1">{items.length} plan{items.length > 1 ? 's' : ''} configuré{items.length > 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setForm(emptyForm) }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nouveau plan
        </button>
      </div>

      {/* Résumé statuts */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="flex items-center gap-3 px-4 py-3 bg-red-900/20 border border-red-800 rounded-xl">
          <AlertTriangle size={18} className="text-red-400" />
          <div>
            <p className="text-2xl font-bold text-red-400 leading-none">{retard}</p>
            <p className="text-xs text-red-400/70 mt-0.5">En retard</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-orange-900/20 border border-orange-800 rounded-xl">
          <Clock size={18} className="text-orange-400" />
          <div>
            <p className="text-2xl font-bold text-orange-400 leading-none">{bientot}</p>
            <p className="text-xs text-orange-400/70 mt-0.5">Bientôt dû</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-green-900/20 border border-green-800 rounded-xl">
          <CheckCircle size={18} className="text-green-400" />
          <div>
            <p className="text-2xl font-bold text-green-400 leading-none">{ok}</p>
            <p className="text-xs text-green-400/70 mt-0.5">À jour</p>
          </div>
        </div>
      </div>

      {/* Liste des plans */}
      {loading ? (
        <div className="flex justify-center py-16 text-gray-500">Chargement...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-600 bg-gray-800 rounded-xl border border-gray-700">
          <RefreshCw size={36} className="mb-3 opacity-30" />
          <p>Aucun plan de maintenance configuré</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map(mp => {
            const cfg = statutConfig[mp.statut as keyof typeof statutConfig] || statutConfig.inconnu
            const Icon = cfg.icon
            const pct = progressPercent(mp)

            return (
              <div key={mp.id} className={`rounded-xl border p-5 transition-colors ${mp.actif ? cfg.bg : 'bg-gray-800/50 border-gray-700 opacity-60'}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${cfg.badge}`}>
                        <Icon size={11} />
                        {mp.statut === 'en_retard'
                          ? `En retard de ${Math.abs(mp.jours_restants ?? 0)}j`
                          : mp.statut === 'bientot'
                          ? `Dans ${mp.jours_restants}j`
                          : cfg.label}
                      </span>
                      {!mp.actif && (
                        <span className="px-2 py-0.5 bg-gray-700 text-gray-500 rounded border border-gray-600 text-xs">Inactif</span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-white">{mp.titre}</h3>
                    {mp.description && <p className="text-sm text-gray-400 mt-0.5">{mp.description}</p>}

                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Wrench size={11} /> {mp.machine_nom || `Machine #${mp.machine_id}`}</span>
                      <span className="flex items-center gap-1"><RefreshCw size={11} /> Tous les {mp.frequence_jours}j</span>
                      {mp.responsable && <span>Responsable : {mp.responsable}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {mp.actif && (
                      <button
                        onClick={() => marquerEffectue(mp)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors"
                        title="Marquer comme effectuée maintenant"
                      >
                        <CheckCircle size={13} />
                        Effectuée
                      </button>
                    )}
                    <button onClick={() => openEdit(mp)} className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors" title="Modifier">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => handleDelete(mp)} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors" title="Supprimer">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Barre de progression */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>
                      Dernière exécution : {mp.derniere_execution
                        ? new Date(mp.derniere_execution).toLocaleDateString('fr-FR')
                        : 'Jamais'}
                    </span>
                    <span>
                      Prochaine : {mp.prochaine_echeance
                        ? new Date(mp.prochaine_echeance).toLocaleDateString('fr-FR')
                        : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${cfg.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal create/edit */}
      {(showCreate || editItem) && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h3 className="text-white font-semibold">
                {editItem ? `Modifier — ${editItem.titre}` : 'Nouveau plan de maintenance'}
              </h3>
              <button onClick={() => { setShowCreate(false); setEditItem(null) }} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Machine *</label>
                  <select value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))} required className={selectCls}>
                    <option value="">Choisir une machine...</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Titre *</label>
                  <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} required className={inputCls} placeholder="Ex : Vérification hydraulique" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className={textareaCls} placeholder="Détail des opérations à effectuer..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Fréquence (jours) *</label>
                  <input type="number" min="1" value={form.frequence_jours} onChange={e => setForm(f => ({ ...f, frequence_jours: e.target.value }))} required className={inputCls} placeholder="30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Alerte avant (jours)</label>
                  <input type="number" min="1" value={form.alert_jours} onChange={e => setForm(f => ({ ...f, alert_jours: e.target.value }))} className={inputCls} placeholder="7" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Responsable</label>
                  <input value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} className={inputCls} placeholder="Nom du responsable" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setForm(f => ({ ...f, actif: !f.actif }))}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${form.actif ? 'bg-green-500' : 'bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.actif ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-sm text-gray-300">{form.actif ? 'Plan actif' : 'Plan inactif'}</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowCreate(false); setEditItem(null) }} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Annuler</button>
                <button type="submit" className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
                  {editItem ? 'Enregistrer' : 'Créer le plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
const textareaCls = "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 resize-none transition-colors"
const selectCls = "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
