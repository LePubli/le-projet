import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import MediaUploader, { type MediaItem } from '../components/MediaUploader'
import { ChatPanel } from '../components/ExtraFeatures'
import {
  ArrowLeft, AlertTriangle, ClipboardList, Wrench, Package,
  Edit2, Save, X, CheckCircle, Clock, ChevronRight, Plus, FileText, Sparkles,
  Upload, Image as ImageIcon
} from 'lucide-react'
import toast from 'react-hot-toast'

const criticiteColors: Record<number, string> = {
  1: 'bg-blue-900/40 text-blue-300 border-blue-700',
  2: 'bg-green-900/40 text-green-300 border-green-700',
  3: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  4: 'bg-orange-900/40 text-orange-300 border-orange-700',
  5: 'bg-red-900/40 text-red-300 border-red-700',
}
const criticiteLabel: Record<number, string> = {
  1: 'Très faible', 2: 'Faible', 3: 'Moyen', 4: 'Élevé', 5: 'Critique',
}

export default function PanneDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'chef_equipe'

  const [panne, setPanne] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Protocole édition
  const [editingProtocole, setEditingProtocole] = useState(false)
  const [protocoleVal, setProtocoleVal] = useState('')

  // Solution / cause édition
  const [editingDiag, setEditingDiag] = useState(false)
  const [diagForm, setDiagForm] = useState<{
    cause_reelle: string
    solution: string
    protocole_reparation: string
    cause_medias: MediaItem[]
    solution_medias: MediaItem[]
  }>({ cause_reelle: '', solution: '', protocole_reparation: '', cause_medias: [], solution_medias: [] })

  // Modal nouvelle intervention liée
  const [showInterModal, setShowInterModal] = useState(false)
  const [machines, setMachines] = useState<any[]>([])
  const [interForm, setInterForm] = useState({ technicien: '', duree: '', commentaire: '' })

  // Gestion pièces
  const [allPieces, setAllPieces] = useState<any[]>([])
  const [showAddPiece, setShowAddPiece] = useState(false)
  const [pieceSearch, setPieceSearch] = useState('')
  const [pieceForm, setPieceForm] = useState({ piece_id: '', quantite: '1', deduire_stock: true })
  const [removingPiece, setRemovingPiece] = useState<number | null>(null)

  // Auto-suggestion pièces
  const [suggestedPieces, setSuggestedPieces] = useState<any[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  const fetchPanne = useCallback(() => {
    api.get(`/pannes/${id}/detail`)
      .then(r => {
        setPanne(r.data)
        setProtocoleVal(r.data.protocole_reparation || '')
        setDiagForm({
          cause_reelle: r.data.cause_reelle || '',
          solution: r.data.solution || '',
          protocole_reparation: r.data.protocole_reparation || '',
          cause_medias: r.data.cause_medias || [],
          solution_medias: r.data.solution_medias || [],
        })
      })
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchPanne() }, [fetchPanne])

  const saveProtocole = async () => {
    try {
      await api.put(`/pannes/${id}`, { protocole_reparation: protocoleVal })
      toast.success('Protocole enregistré')
      setEditingProtocole(false)
      fetchPanne()
    } catch { toast.error('Erreur') }
  }

  const saveDiag = async () => {
    try {
      await api.put(`/pannes/${id}`, {
        cause_reelle: diagForm.cause_reelle,
        solution: diagForm.solution,
        protocole_reparation: diagForm.protocole_reparation,
        cause_medias: diagForm.cause_medias,
        solution_medias: diagForm.solution_medias,
      })
      toast.success('Diagnostic mis à jour')
      setEditingDiag(false)
      fetchPanne()
    } catch { toast.error('Erreur') }
  }

  // Ouvre le formulaire ajout pièce + charge la liste + suggestions
  const openAddPiece = () => {
    if (allPieces.length === 0) {
      api.get('/pieces/').then(r => setAllPieces(r.data))
    }
    setPieceForm({ piece_id: '', quantite: '1', deduire_stock: true })
    setPieceSearch('')
    setShowAddPiece(true)
    // Fetch auto-suggestions
    setLoadingSuggestions(true)
    api.get(`/kpi/pieces-suggest`, {
      params: { machine_id: panne?.machine_id, panne_titre: panne?.titre }
    }).then(r => {
      setSuggestedPieces(r.data || [])
    }).catch(() => {
      setSuggestedPieces([])
    }).finally(() => setLoadingSuggestions(false))
  }

  const addPiece = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pieceForm.piece_id) { toast.error('Sélectionnez une pièce'); return }
    try {
      const res = await api.post(`/pannes/${id}/pieces`, {
        piece_id: Number(pieceForm.piece_id),
        quantite: Number(pieceForm.quantite),
        deduire_stock: pieceForm.deduire_stock,
      })
      const stockMsg = pieceForm.deduire_stock ? ` — stock restant : ${res.data.stock_apres}` : ''
      toast.success(`${res.data.nom} × ${res.data.quantite} ajouté${stockMsg}`)
      setShowAddPiece(false)
      fetchPanne()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur')
    }
  }

  const removePiece = async (pieceId: number, pieceName: string, restaurerStock: boolean) => {
    setRemovingPiece(null)
    try {
      await api.delete(`/pannes/${id}/pieces/${pieceId}?restaurer_stock=${restaurerStock}`)
      toast.success(`${pieceName} retiré${restaurerStock ? ' — stock restauré' : ''}`)
      fetchPanne()
    } catch { toast.error('Erreur') }
  }

  const createIntervention = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/interventions/', {
        machine_id: panne.machine_id,
        panne_id: panne.id,
        technicien: interForm.technicien,
        duree: interForm.duree ? Number(interForm.duree) : null,
        commentaire: interForm.commentaire,
      })
      toast.success('Intervention enregistrée')
      setShowInterModal(false)
      setInterForm({ technicien: '', duree: '', commentaire: '' })
      fetchPanne()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
    </div>
  )
  if (!panne) return <div className="p-6 text-gray-400">Panne introuvable</div>

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto pb-24 sm:pb-6">
      {/* Fil d'Ariane */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/pannes')} className="hover:text-white transition-colors flex items-center gap-1">
          <ArrowLeft size={14} /> Pannes
        </button>
        <ChevronRight size={13} />
        <span className="text-gray-300 truncate">{panne.titre}</span>
      </div>

      {/* En-tête */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={20} className="text-orange-400 shrink-0" />
              <h1 className="text-2xl font-bold text-white">{panne.titre}</h1>
              <span className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${criticiteColors[panne.criticite] || 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                {criticiteLabel[panne.criticite] || `Niveau ${panne.criticite}`}
              </span>
            </div>
            {panne.description && (
              <p className="text-gray-400 text-sm mt-1">{panne.description}</p>
            )}
          </div>
          <a
            href={`/pannes/${id}/rapport`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-600"
          >
            <FileText size={15} />
            Rapport PDF
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-700">
          <InfoCell label="Machine" value={panne.machine_nom || `#${panne.machine_id}`} accent />
          <InfoCell label="Déclarée le" value={new Date(panne.created_at).toLocaleDateString('fr-FR')} />
          <InfoCell label="Temps moy. réparation" value={panne.temps_moyen_reparation ? `${panne.temps_moyen_reparation} min` : '—'} />
          <InfoCell label="Interventions liées" value={String(panne.interventions_liees?.length || 0)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Colonne gauche (2/3) */}
        <div className="lg:col-span-2 space-y-5">

          {/* Protocole de réparation */}
          <Section
            title="Protocole de réparation"
            icon={<ClipboardList size={16} className="text-orange-400" />}
            action={canEdit && !editingProtocole ? (
              <button onClick={() => setEditingProtocole(true)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                <Edit2 size={12} /> Modifier
              </button>
            ) : null}
          >
            {editingProtocole ? (
              <div className="space-y-3">
                <textarea
                  value={protocoleVal}
                  onChange={e => setProtocoleVal(e.target.value)}
                  rows={8}
                  autoFocus
                  placeholder="Décrivez le protocole de réparation étape par étape..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 resize-y font-mono leading-relaxed"
                />
                <div className="flex gap-2">
                  <button onClick={saveProtocole} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors">
                    <Save size={12} /> Enregistrer
                  </button>
                  <button onClick={() => { setEditingProtocole(false); setProtocoleVal(panne.protocole_reparation || '') }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">
                    Annuler
                  </button>
                </div>
              </div>
            ) : panne.protocole_reparation ? (
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{panne.protocole_reparation}</pre>
            ) : (
              <p className="text-gray-600 text-sm italic">
                Aucun protocole défini.{canEdit && ' Cliquez sur Modifier pour en ajouter un.'}
              </p>
            )}
          </Section>

          {/* Diagnostic */}
          <Section
            title="Diagnostic"
            icon={<AlertTriangle size={16} className="text-yellow-400" />}
            action={canEdit && !editingDiag ? (
              <button onClick={() => setEditingDiag(true)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                <Edit2 size={12} /> Modifier
              </button>
            ) : null}
          >
            {editingDiag ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cause réelle</label>
                  <textarea value={diagForm.cause_reelle} onChange={e => setDiagForm(f => ({ ...f, cause_reelle: e.target.value }))} rows={3} className={textareaCls} placeholder="Cause identifiée de la panne..." />
                  <div className="mt-2">
                    <MediaUploader
                      medias={diagForm.cause_medias}
                      onChange={(m) => setDiagForm(f => ({ ...f, cause_medias: m }))}
                      canEdit={true}
                      label="Médias de la cause (photos / vidéos)"
                      size="sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Solution appliquée</label>
                  <textarea value={diagForm.solution} onChange={e => setDiagForm(f => ({ ...f, solution: e.target.value }))} rows={3} className={textareaCls} placeholder="Solution mise en œuvre..." />
                  <div className="mt-2">
                    <MediaUploader
                      medias={diagForm.solution_medias}
                      onChange={(m) => setDiagForm(f => ({ ...f, solution_medias: m }))}
                      canEdit={true}
                      label="Médias de la solution (photos / vidéos)"
                      size="sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveDiag} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors">
                    <Save size={12} /> Enregistrer
                  </button>
                  <button onClick={() => setEditingDiag(false)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {panne.causes_possibles?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Causes possibles</p>
                    <div className="flex flex-wrap gap-2">
                      {panne.causes_possibles.map((c: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                <DiagRow label="Cause réelle" value={panne.cause_reelle} />
                <MediaSection
                  label="Médias de la cause"
                  medias={panne.cause_medias || []}
                  canEdit={canEdit}
                  onEdit={() => setEditingDiag(true)}
                />
                <DiagRow label="Solution appliquée" value={panne.solution} />
                <MediaSection
                  label="Médias de la solution"
                  medias={panne.solution_medias || []}
                  canEdit={canEdit}
                  onEdit={() => setEditingDiag(true)}
                />
              </div>
            )}
          </Section>

          {/* Interventions réalisées */}
          <Section
            title={`Interventions réalisées (${panne.interventions_liees?.length || 0})`}
            icon={<Wrench size={16} className="text-blue-400" />}
            action={
              <button
                onClick={() => setShowInterModal(true)}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
              >
                <Plus size={12} /> Ajouter
              </button>
            }
          >
            {panne.interventions_liees?.length === 0 ? (
              <p className="text-gray-600 text-sm italic">Aucune intervention enregistrée pour cette panne.</p>
            ) : (
              <div className="space-y-3">
                {panne.interventions_liees.map((inter: any) => (
                  <div key={inter.id} className="flex items-start gap-3 p-3 bg-gray-700/40 rounded-lg border border-gray-700">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${inter.validee ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                      {inter.validee ? <CheckCircle size={14} /> : <Clock size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white">{inter.technicien}</p>
                        <div className="flex items-center gap-2">
                          {inter.duree && <span className="text-xs text-gray-500">{inter.duree} min</span>}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${inter.validee ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/40 text-yellow-400'}`}>
                            {inter.validee ? `Validée par ${inter.validee_par}` : 'En attente de validation'}
                          </span>
                        </div>
                      </div>
                      {inter.commentaire && (
                        <p className="text-sm text-gray-400 mt-1">{inter.commentaire}</p>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        {inter.date_intervention
                          ? new Date(inter.date_intervention).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : new Date(inter.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Colonne droite (1/3) */}
        <div className="space-y-5">

          {/* Pièces utilisées */}
          <Section
            title="Pièces utilisées"
            icon={<Package size={16} className="text-purple-400" />}
            action={
              <button
                onClick={openAddPiece}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
              >
                <Plus size={12} /> Ajouter
              </button>
            }
          >
            {panne.pieces_detail?.length === 0 ? (
              <p className="text-gray-600 text-sm italic">Aucune pièce renseignée.</p>
            ) : (
              <div className="space-y-2">
                {panne.pieces_detail.map((p: any) => (
                  <div key={p.piece_id} className="flex items-center justify-between p-2.5 bg-gray-700/40 rounded-lg border border-gray-700">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{p.nom}</p>
                      <p className="text-xs text-gray-500 font-mono">{p.reference}</p>
                    </div>
                    <span className="shrink-0 ml-2 px-2 py-0.5 bg-gray-600 text-gray-200 rounded text-xs font-medium">
                      ×{p.quantite}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Chat / Discussion */}
          <ChatPanel panneId={panne.id} />

          {/* Infos complémentaires */}
          <Section title="Informations" icon={<AlertTriangle size={16} className="text-gray-400" />}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">ID panne</span>
                <span className="text-gray-300 font-mono">#{panne.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Machine</span>
                <Link to={`/machines/${panne.machine_id}`} className="text-orange-400 hover:text-orange-300 transition-colors">
                  {panne.machine_nom}
                </Link>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Créée le</span>
                <span className="text-gray-300">{new Date(panne.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              {panne.updated_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Modifiée le</span>
                  <span className="text-gray-300">{new Date(panne.updated_at).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* Modal : Ajouter une pièce */}
      {showAddPiece && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
              <h3 className="text-white font-semibold">Ajouter une pièce</h3>
              <button onClick={() => setShowAddPiece(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={addPiece} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {/* Auto-suggestions */}
              {loadingSuggestions ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500" />
                  <span>Chargement des suggestions...</span>
                </div>
              ) : suggestedPieces.length > 0 ? (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles size={13} className="text-orange-400" />
                    <span className="text-xs font-semibold text-gray-400 uppercase">Pièces suggérées</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedPieces.map((sp: any) => (
                      <button
                        key={sp.piece_id || sp.id}
                        type="button"
                        onClick={() => setPieceForm(f => ({ ...f, piece_id: String(sp.piece_id || sp.id) }))}
                        className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors min-h-[44px] ${
                          pieceForm.piece_id === String(sp.piece_id || sp.id)
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                            : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-orange-500/50 hover:text-white'
                        }`}
                      >
                        <span className="text-xs font-medium font-mono">{sp.reference}</span>
                        <span className="text-xs opacity-80 truncate max-w-[150px]">{sp.nom}</span>
                        <span className="text-[10px] text-gray-500">utilisée {sp.occurrences || sp.count || 0} fois</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Manual piece search */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Rechercher une pièce</label>
                <div className="relative">
                  <input
                    value={pieceSearch}
                    onChange={e => setPieceSearch(e.target.value)}
                    placeholder="Référence ou nom..."
                    className={inputCls}
                  />
                </div>
                {pieceSearch && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {allPieces
                      .filter(p =>
                        (p.reference || '').toLowerCase().includes(pieceSearch.toLowerCase()) ||
                        (p.nom || '').toLowerCase().includes(pieceSearch.toLowerCase())
                      )
                      .slice(0, 10)
                      .map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPieceForm(f => ({ ...f, piece_id: String(p.id) })); setPieceSearch(p.reference || p.nom) }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            pieceForm.piece_id === String(p.id) ? 'bg-orange-500/20 text-orange-300' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          <span className="font-mono text-xs">{p.reference}</span> — {p.nom}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Quantité</label>
                <input
                  type="number" min="1" value={pieceForm.quantite}
                  onChange={e => setPieceForm(f => ({ ...f, quantite: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox" checked={pieceForm.deduire_stock}
                  onChange={e => setPieceForm(f => ({ ...f, deduire_stock: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500"
                />
                Déduire du stock
              </label>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddPiece(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Annuler</button>
                <button type="submit" className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Nouvelle intervention */}
      {showInterModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h3 className="text-white font-semibold">Nouvelle intervention — {panne.titre}</h3>
              <button onClick={() => setShowInterModal(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={createIntervention} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Technicien *</label>
                <input
                  value={interForm.technicien} onChange={e => setInterForm(f => ({ ...f, technicien: e.target.value }))}
                  required autoFocus className={inputCls} placeholder="Nom du technicien"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Durée (minutes)</label>
                <input
                  type="number" min="1"
                  value={interForm.duree} onChange={e => setInterForm(f => ({ ...f, duree: e.target.value }))}
                  className={inputCls} placeholder="Ex : 90"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Commentaire / travaux effectués</label>
                <textarea
                  value={interForm.commentaire} onChange={e => setInterForm(f => ({ ...f, commentaire: e.target.value }))}
                  rows={4} className={textareaCls} placeholder="Décrire les actions réalisées..."
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowInterModal(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Annuler</button>
                <button type="submit" className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sous-composants ───────────────────────────────────────────────────────────

const inputCls = "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
const textareaCls = "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 resize-y transition-colors"

function Section({ title, icon, action, children }: {
  title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function InfoCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${accent ? 'text-orange-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function DiagRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      {value ? (
        <p className="text-sm text-gray-300 leading-relaxed">{value}</p>
      ) : (
        <p className="text-sm text-gray-600 italic">Non renseigné</p>
      )}
    </div>
  )
}

// ─── MediaSection ──────────────────────────────────────────────────────────
// Affiche les médias en mode lecture. S'il n'y a aucun média et que
// l'utilisateur peut éditer, un placeholder avec bouton "Ajouter" est affiché
// pour rendre la fonctionnalité découverte (sinon elle est invisible).
function MediaSection({ label, medias, canEdit, onEdit }: {
  label: string
  medias: MediaItem[]
  canEdit: boolean
  onEdit: () => void
}) {
  if (medias.length > 0) {
    return <MediaUploader medias={medias} canEdit={false} label={label} size="sm" />
  }
  // No medias — show a discoverable placeholder for editors
  if (canEdit) {
    return (
      <div>
        <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
          <ImageIcon size={11} /> {label}
        </p>
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-gray-300 rounded-lg text-xs font-medium transition-colors border border-dashed border-gray-600"
        >
          <Upload size={12} /> Aucun média — cliquer pour ajouter
        </button>
      </div>
    )
  }
  // No medias, no edit rights — show a discreet "Aucun média" label so the
  // section is still visible (previously: completely hidden, which made the
  // feature look missing to non-editors).
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
        <ImageIcon size={11} /> {label}
      </p>
      <p className="text-xs text-gray-600 italic">Aucun média</p>
    </div>
  )
}
