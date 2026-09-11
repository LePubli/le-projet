/* frontend/src/pages/BonTravailForm.tsx — Formulaire création BT
   Reçoit ?type=entretien|nettoyage en query param
*/
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import MediaUploader, { type MediaItem } from '../components/MediaUploader'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, Trash2, Save, Cog } from 'lucide-react'

interface GammeInput {
  ordre: number; code_gamme: string; famille_gamme: string
  texte_gamme: string; consignation: boolean; condamnation: boolean
  duree_estimee_h: string
}

export default function BonTravailForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const typeBt = params.get('type') || 'entretien'

  const [machines, setMachines] = useState<{ id: number; nom: string; code_interne: string | null }[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [machineId, setMachineId] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [urgence, setUrgence] = useState('normale')
  const [famille, setFamille] = useState('')
  const [gammes, setGammes] = useState<GammeInput[]>([{ ordre: 1, code_gamme: '', famille_gamme: '', texte_gamme: '', consignation: false, condamnation: false, duree_estimee_h: '' }])
  const [causeMedias, setCauseMedias] = useState<MediaItem[]>([])
  const [solutionMedias, setSolutionMedias] = useState<MediaItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/machines/?limit=500').then(r => setMachines(r.data)).catch(() => {})
  }, [])

  const addGamme = () => {
    setGammes(prev => [...prev, {
      ordre: prev.length + 1, code_gamme: '', famille_gamme: '',
      texte_gamme: '', consignation: false, condamnation: false, duree_estimee_h: '',
    }])
  }

  const removeGamme = (idx: number) => {
    setGammes(prev => prev.filter((_, i) => i !== idx).map((g, i) => ({ ...g, ordre: i + 1 })))
  }

  const updateGamme = (idx: number, field: keyof GammeInput, value: string | boolean) => {
    setGammes(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g))
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Le titre est requis'); return }
    setSaving(true)
    try {
      const validGammes = gammes.filter(g => g.texte_gamme.trim())
      await api.post('/bons-travail/', {
        type_bt: typeBt,
        titre: title,
        description: description || null,
        machine_id: machineId ? parseInt(machineId) : null,
        date_debut_prevue: dateDebut || null,
        date_fin_prevue: dateFin || null,
        degre_urgence: urgence,
        famille: famille || null,
        gammes: validGammes.map(g => ({
          ordre: g.ordre,
          code_gamme: g.code_gamme || null,
          famille_gamme: g.famille_gamme || null,
          texte_gamme: g.texte_gamme,
          consignation: g.consignation,
          condamnation: g.condamnation,
          duree_estimee_h: g.duree_estimee_h ? parseFloat(g.duree_estimee_h) : null,
        })),
        cause_medias: causeMedias,
        solution_medias: solutionMedias,
      })
      toast.success('BT créé avec succès')
      navigate(typeBt === 'entretien' ? '/entretien' : '/nettoyage')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Erreur lors de la création')
    }
    finally { setSaving(false) }
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-3xl mx-auto space-y-6 pb-24 sm:pb-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">
            Nouveau BT — {typeBt === 'entretien' ? 'Entretien' : 'Nettoyage'}
          </h1>
          <p className="text-xs text-gray-500">Bon de Travail Préventif</p>
        </div>
      </div>

      {/* En-tête */}
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-gray-400 text-xs mb-1.5">Titre *</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Ex: Entretien hebdomadaire crible à disques" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">Machine</label>
            <div className="relative">
              <Cog size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <select value={machineId} onChange={e => setMachineId(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Aucune —</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.code_interne || m.nom}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">Degré d'urgence</label>
            <select value={urgence} onChange={e => setUrgence(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500">
              <option value="basse">Basse</option>
              <option value="normale">Normale</option>
              <option value="haute">Haute</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">Début prévu</label>
            <input type="datetime-local" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">Fin prévue</label>
            <input type="datetime-local" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">Famille</label>
            <input value={famille} onChange={e => setFamille(e.target.value)} placeholder="Ex: Crible à disque"
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <div>
          <label className="block text-gray-400 text-xs mb-1.5">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Description ou instructions particulières..." />
        </div>
      </div>

      {/* Gammes */}
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Gammes d'opérations</label>
          <button onClick={addGamme} className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs">
            <Plus size={14} /> Ajouter
          </button>
        </div>
        {gammes.map((g, idx) => (
          <div key={idx} className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-6">#{g.ordre}</span>
              <input value={g.code_gamme} onChange={e => updateGamme(idx, 'code_gamme', e.target.value)}
                placeholder="Code" className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs" />
              <input value={g.famille_gamme} onChange={e => updateGamme(idx, 'famille_gamme', e.target.value)}
                placeholder="Famille" className="w-28 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs" />
              <input value={g.duree_estimee_h} onChange={e => updateGamme(idx, 'duree_estimee_h', e.target.value)}
                placeholder="Durée (h)" className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs" />
              <label className="flex items-center gap-1 text-[10px] text-gray-400 ml-auto">
                <input type="checkbox" checked={g.consignation} onChange={e => updateGamme(idx, 'consignation', e.target.checked)} /> Cons.
              </label>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                <input type="checkbox" checked={g.condamnation} onChange={e => updateGamme(idx, 'condamnation', e.target.checked)} /> Cond.
              </label>
              <button onClick={() => removeGamme(idx)} className="text-gray-600 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
            <input value={g.texte_gamme} onChange={e => updateGamme(idx, 'texte_gamme', e.target.value)}
              placeholder="Description de l'étape..."
              className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
        ))}
      </div>

      {/* Médias (photos + vidéos) */}
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-4">
        <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider">Médias (photos / vidéos)</label>
        <div>
          <MediaUploader
            medias={causeMedias}
            onChange={setCauseMedias}
            canEdit={true}
            label="Observations / état initial (avant travaux)"
            size="sm"
          />
        </div>
        <div>
          <MediaUploader
            medias={solutionMedias}
            onChange={setSolutionMedias}
            canEdit={true}
            label="Résultat / état final (après travaux)"
            size="sm"
          />
        </div>
        <p className="text-gray-600 text-[10px]">JPG, PNG, GIF, WEBP, MP4, WEBM, MOV — max 50 Mo par fichier</p>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <button onClick={() => navigate(-1)} className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-700 text-sm">
          Annuler
        </button>
        <button onClick={handleSubmit} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium">
          <Save size={16} /> {saving ? 'Création...' : 'Créer le BT'}
        </button>
      </div>
    </div>
  )
}