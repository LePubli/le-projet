import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Search, X, Edit2, Trash2, Package, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Piece {
  id: number
  reference: string
  nom: string
  stock: number
  emplacement?: string
  fournisseur?: string
  description?: string
}

const emptyForm = { reference: '', nom: '', stock: '0', emplacement: '', fournisseur: '', description: '' }

export default function Pieces() {
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Piece | null>(null)
  const [form, setForm] = useState(emptyForm)

  const fetchPieces = () => api.get('/pieces/').then(r => setPieces(r.data)).finally(() => setLoading(false))
  useEffect(() => { fetchPieces() }, [])

  const filtered = pieces.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    p.reference.toLowerCase().includes(search.toLowerCase()) ||
    p.fournisseur?.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setForm(emptyForm); setEditing(null); setShowForm(true) }
  const openEdit = (p: Piece) => {
    setForm({ reference: p.reference, nom: p.nom, stock: String(p.stock), emplacement: p.emplacement || '', fournisseur: p.fournisseur || '', description: p.description || '' })
    setEditing(p); setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { ...form, stock: Number(form.stock) }
    try {
      if (editing) { await api.put(`/pieces/${editing.id}`, payload); toast.success('Pièce mise à jour') }
      else { await api.post('/pieces/', payload); toast.success('Pièce créée') }
      setShowForm(false); fetchPieces()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Erreur') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette pièce ?')) return
    try { await api.delete(`/pieces/${id}`); toast.success('Pièce supprimée'); fetchPieces() }
    catch { toast.error('Erreur') }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pièces détachées</h1>
          <p className="text-gray-400 text-sm mt-1">{pieces.length} référence{pieces.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Nouvelle pièce
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, nom, fournisseur..." className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
              <th className="text-left px-4 py-3">Référence</th>
              <th className="text-left px-4 py-3">Désignation</th>
              <th className="text-left px-4 py-3">Stock</th>
              <th className="text-left px-4 py-3">Emplacement</th>
              <th className="text-left px-4 py-3">Fournisseur</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="text-center py-8 text-gray-500">Chargement...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-gray-500">Aucune pièce trouvée</td></tr>
              : filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-orange-400">{p.reference}</td>
                  <td className="px-4 py-3">
                    <p className="text-white">{p.nom}</p>
                    {p.description && <p className="text-gray-500 text-xs truncate max-w-xs">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {p.stock === 0 && <AlertCircle size={13} className="text-red-400" />}
                      <span className={`font-bold ${p.stock === 0 ? 'text-red-400' : p.stock < 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {p.stock}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{p.emplacement || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{p.fournisseur || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-400 transition-colors"><Edit2 size={15} /></button>
                      <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 my-4 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">{editing ? 'Modifier la pièce' : 'Nouvelle pièce'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 hover:text-white" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Référence *</label>
                <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} required disabled={!!editing} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Désignation *</label>
                <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Stock</label>
                  <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Emplacement</label>
                  <input value={form.emplacement} onChange={e => setForm(f => ({ ...f, emplacement: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Fournisseur</label>
                <input value={form.fournisseur} onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 resize-none" />
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
