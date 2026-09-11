import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { Plus, Search, Wrench, ChevronRight, Edit2, Trash2, X, QrCode, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import ImportExportDialog from '../components/ImportExportDialog'

interface Machine {
  id: number
  nom: string
  site?: string
  ligne?: string
  zone?: string
  fabricant?: string
  modele?: string
  code_interne?: string
  statut: string
  qr_code?: string
  notes?: string
}

const statutColors: Record<string, string> = {
  operationnel: 'bg-green-900/50 text-green-400 border-green-700',
  en_panne: 'bg-red-900/50 text-red-400 border-red-700',
  maintenance: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
  arret: 'bg-gray-700 text-gray-400 border-gray-600',
}

const emptyForm = { nom: '', site: '', ligne: '', zone: '', fabricant: '', modele: '', code_interne: '', statut: 'operationnel', notes: '' }

export default function Machines() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'chef_equipe'
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Machine | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showQr, setShowQr] = useState<Machine | null>(null)
  const [showImportExport, setShowImportExport] = useState(false)
  const navigate = useNavigate()

  const fetchMachines = () => {
    api.get('/machines/').then(r => setMachines(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchMachines() }, [])

  const filtered = machines.filter(m =>
    m.nom.toLowerCase().includes(search.toLowerCase()) ||
    m.code_interne?.toLowerCase().includes(search.toLowerCase()) ||
    m.site?.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setForm(emptyForm); setEditing(null); setShowForm(true) }
  const openEdit = (m: Machine) => {
    setForm({ nom: m.nom, site: m.site || '', ligne: m.ligne || '', zone: m.zone || '', fabricant: m.fabricant || '', modele: m.modele || '', code_interne: m.code_interne || '', statut: m.statut, notes: m.notes || '' })
    setEditing(m); setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editing) {
        await api.put(`/machines/${editing.id}`, form)
        toast.success('Machine mise à jour')
      } else {
        await api.post('/machines/', form)
        toast.success('Machine créée')
      }
      setShowForm(false); fetchMachines()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette machine ?')) return
    try {
      await api.delete(`/machines/${id}`)
      toast.success('Machine supprimée')
      fetchMachines()
    } catch { toast.error('Erreur lors de la suppression') }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Machines</h1>
          <p className="text-gray-400 text-sm mt-1">{machines.length} machine{machines.length > 1 ? 's' : ''} enregistrée{machines.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <button onClick={() => setShowImportExport(true)} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
              <Upload size={16} /> Import / Export
            </button>
          )}
          {canEdit && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus size={16} /> Nouvelle machine
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, code, site..." className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
      </div>

      {/* Vue desktop — table */}
      <div className="hidden md:block bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
              <th className="text-left px-4 py-3">Machine</th>
              <th className="text-left px-4 py-3">Site / Zone</th>
              <th className="text-left px-4 py-3">Fabricant</th>
              <th className="text-left px-4 py-3">Code</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Chargement...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Aucune machine trouvée</td></tr>
            ) : filtered.map(m => (
              <tr key={m.id} className="border-b border-gray-700 hover:bg-gray-750 hover:bg-gray-700/50 transition-colors">
                <td className="px-4 py-3">
                  <button onClick={() => navigate(`/machines/${m.id}`)} className="text-white font-medium hover:text-orange-400 transition-colors text-left">
                    {m.nom}
                  </button>
                  {m.modele && <p className="text-gray-500 text-xs">{m.modele}</p>}
                </td>
                <td className="px-4 py-3 text-gray-400">{[m.site, m.ligne, m.zone].filter(Boolean).join(' / ') || '—'}</td>
                <td className="px-4 py-3 text-gray-400">{m.fabricant || '—'}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{m.code_interne || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded border text-xs font-medium ${statutColors[m.statut] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                    {m.statut.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowQr(m)} className="text-gray-400 hover:text-white transition-colors" title="QR Code">
                      <QrCode size={15} />
                    </button>
                    {canEdit && <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-blue-400 transition-colors"><Edit2 size={15} /></button>}
                    {canEdit && <button onClick={() => handleDelete(m.id)} className="text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>}
                    <button onClick={() => navigate(`/machines/${m.id}`)} className="text-gray-400 hover:text-orange-400 transition-colors"><ChevronRight size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vue mobile — cartes */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Aucune machine trouvée</div>
        ) : filtered.map(m => (
          <div key={m.id} className="bg-gray-800 rounded-xl border border-gray-700 p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <button onClick={() => navigate(`/machines/${m.id}`)} className="text-white font-medium text-sm flex-1 min-w-0 text-left">
                {m.nom}
              </button>
              <span className={`shrink-0 px-2 py-0.5 rounded border text-[10px] font-medium ${statutColors[m.statut] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                {m.statut.replace('_', ' ')}
              </span>
            </div>
            {m.modele && <p className="text-gray-500 text-xs mb-1">{m.modele}</p>}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-mono">{m.code_interne || '—'}</span>
              <span className="truncate ml-2">{[m.site, m.zone].filter(Boolean).join(' / ') || '—'}</span>
            </div>
            <div className="flex gap-3 mt-2 pt-2 border-t border-gray-700/50">
              <button onClick={() => setShowQr(m)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1"><QrCode size={12} /> QR</button>
              {canEdit && <button onClick={() => openEdit(m)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Edit2 size={12} /> Modifier</button>}
              <button onClick={() => navigate(`/machines/${m.id}`)} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 ml-auto">Fiche <ChevronRight size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* QR Modal */}
      {showQr && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">QR Code — {showQr.nom}</h3>
              <button onClick={() => setShowQr(null)}><X size={18} className="text-gray-400 hover:text-white" /></button>
            </div>
            <img src={showQr.qr_code} alt="QR Code" className="w-full rounded-lg bg-white p-2" />
            <p className="text-xs text-gray-400 mt-2 text-center">{showQr.code_interne}</p>
          </div>
        </div>
      )}

      {/* Import / Export Dialog */}
      {showImportExport && (
        <ImportExportDialog
          entity="machines"
          label="Machines"
          onClose={() => setShowImportExport(false)}
          onImported={fetchMachines}
        />
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 my-4 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">{editing ? 'Modifier la machine' : 'Nouvelle machine'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 hover:text-white" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {[
                { label: 'Nom *', key: 'nom', required: true },
                { label: 'Site', key: 'site' },
                { label: 'Ligne', key: 'ligne' },
                { label: 'Zone', key: 'zone' },
                { label: 'Fabricant', key: 'fabricant' },
                { label: 'Modèle', key: 'modele' },
                { label: 'Code interne', key: 'code_interne' },
              ].map(({ label, key, required }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} required={required} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Statut</label>
                <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500">
                  <option value="operationnel">Opérationnel</option>
                  <option value="en_panne">En panne</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="arret">Arrêt</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Annuler</button>
                <button type="submit" className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">{editing ? 'Mettre à jour' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
