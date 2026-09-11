import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import MediaUploader, { type MediaItem } from '../components/MediaUploader'
import { ArrowLeft, Search, CheckCircle, X, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Types ──────────────────────────────────────────────────────
interface Machine {
  id: number
  nom: string
  code_interne: string | null
  zone: string | null
  statut: string | null
}

const SEVERITY_OPTIONS = [
  { level: 1, label: 'Mineur',   color: 'bg-gray-600',    activeColor: 'bg-gray-500',   textColor: 'text-gray-200', border: 'border-gray-400' },
  { level: 2, label: 'Faible',   color: 'bg-yellow-600',   activeColor: 'bg-yellow-500', textColor: 'text-white',    border: 'border-yellow-400' },
  { level: 3, label: 'Moyen',    color: 'bg-orange-600',   activeColor: 'bg-orange-500', textColor: 'text-white',    border: 'border-orange-400' },
  { level: 4, label: 'Grave',    color: 'bg-red-600',      activeColor: 'bg-red-500',    textColor: 'text-white',    border: 'border-red-400' },
  { level: 5, label: 'Critique', color: 'bg-red-800',      activeColor: 'bg-red-700',    textColor: 'text-white',    border: 'border-red-500' },
]

export default function QuickPanne() {
  const navigate = useNavigate()

  // ─── Step tracking ────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [submitted, setSubmitted] = useState(false)

  // ─── Step 1: Machine selection ────────────────────────────────
  const [machines, setMachines] = useState<Machine[]>([])
  const [recentMachines, setRecentMachines] = useState<Machine[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null)
  const [loadingMachines, setLoadingMachines] = useState(true)

  // ─── Step 2: Severity ─────────────────────────────────────────
  const [severity, setSeverity] = useState<number>(3)

  // ─── Step 3: Comment + medias (photos + vidéos) ──────────────
  const [comment, setComment] = useState('')
  const [medias, setMedias] = useState<MediaItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  // ─── Fetch machines on mount ──────────────────────────────────
  useEffect(() => {
    api.get('/machines/').then(r => {
      const all: Machine[] = r.data
      setMachines(all)
      // Recent = last 6 machines with pannes or just last 6
      setRecentMachines(all.slice(0, 6))
    }).catch(() => {
      toast.error('Erreur lors du chargement des machines')
    }).finally(() => setLoadingMachines(false))
  }, [])

  // ─── Filtered machines for search ─────────────────────────────
  const filteredMachines = machines.filter(m => {
    if (!searchQuery) return false
    const q = searchQuery.toLowerCase()
    return (
      (m.nom || '').toLowerCase().includes(q) ||
      (m.code_interne || '').toLowerCase().includes(q)
    )
  })

  // ─── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedMachine) return
    setSubmitting(true)
    try {
      const code = selectedMachine.code_interne || selectedMachine.nom
      await api.post('/pannes/', {
        machine_id: selectedMachine.id,
        titre: `Panne - ${code}`,
        criticite: severity,
        description: comment || null,
        // Photos/vidéos attachées comme médias de la cause (signalement initial)
        cause_medias: medias,
      })
      setSubmitted(true)
      toast.success('Panne signalée avec succès !')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Erreur lors de l\'envoi')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Can advance ──────────────────────────────────────────────
  const canAdvance = () => {
    if (step === 1) return selectedMachine !== null
    if (step === 2) return severity > 0
    return true
  }

  const goNext = () => {
    if (step < 3 && canAdvance()) setStep((step + 1) as 1 | 2 | 3)
  }
  const goBack = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3)
  }

  // ─── Success screen ───────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-dvh bg-gray-900 flex flex-col items-center justify-center px-6 py-10">
        <div className="animate-bounce mb-6">
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center">
            <CheckCircle size={56} className="text-green-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Panne signalée !</h2>
        <p className="text-gray-400 text-center mb-8">
          La panne a été enregistrée et sera traitée par l'équipe maintenance.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="w-full max-w-xs py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors text-lg"
        >
          Retour
        </button>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-dvh bg-gray-900 flex flex-col">
      {/* ─── Top bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <button
          onClick={() => step === 1 ? navigate(-1) : goBack()}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-300"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-white font-semibold text-lg flex-1">Signaler une panne</h1>
        <span className="text-gray-500 text-sm">Étape {step}/3</span>
      </div>

      {/* ─── Step indicator ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-6 py-3 shrink-0">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
              s < step ? 'bg-green-500 text-white' :
              s === step ? 'bg-orange-500 text-white' :
              'bg-gray-700 text-gray-500'
            }`}>
              {s < step ? <CheckCircle size={16} /> : s}
            </div>
            {s < 3 && (
              <div className={`flex-1 h-0.5 mx-2 rounded transition-colors ${
                s < step ? 'bg-green-500' : 'bg-gray-700'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* ─── Step content ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* ─── STEP 1: Select machine ──────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold text-lg mb-1">Choisir la machine</h2>
              <p className="text-gray-400 text-sm">Sélectionnez la machine en panne</p>
            </div>

            {/* Recent machines */}
            {!searchQuery && recentMachines.length > 0 && (
              <div>
                <p className="text-gray-500 text-xs uppercase font-bold mb-2 flex items-center gap-1">
                  <Clock size={12} /> Machines récentes
                </p>
                <div className="space-y-2">
                  {recentMachines.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMachine(m)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all min-h-[48px] ${
                        selectedMachine?.id === m.id
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">{m.code_interne || m.nom}</div>
                        {m.code_interne && m.code_interne !== m.nom && (
                          <div className="text-xs opacity-70">{m.nom}</div>
                        )}
                      </div>
                      {m.zone && (
                        <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
                          {m.zone}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher par code ou nom..."
                className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 min-h-[48px]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Search results */}
            {searchQuery && (
              <div className="space-y-2">
                {loadingMachines ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2" />
                    <p className="text-sm">Chargement...</p>
                  </div>
                ) : filteredMachines.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">Aucune machine trouvée</p>
                  </div>
                ) : (
                  filteredMachines.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedMachine(m); setSearchQuery('') }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all min-h-[48px] ${
                        selectedMachine?.id === m.id
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">{m.code_interne || m.nom}</div>
                        {m.code_interne && m.code_interne !== m.nom && (
                          <div className="text-xs opacity-70">{m.nom}</div>
                        )}
                      </div>
                      {m.zone && (
                        <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
                          {m.zone}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Selected machine summary */}
            {selectedMachine && !searchQuery && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-400 text-xs font-bold uppercase">Sélectionné</p>
                    <p className="text-white font-semibold">{selectedMachine.code_interne || selectedMachine.nom}</p>
                    <p className="text-gray-400 text-sm">{selectedMachine.zone || '—'}</p>
                  </div>
                  <CheckCircle size={24} className="text-orange-400" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 2: Select severity ─────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold text-lg mb-1">Niveau de criticité</h2>
              <p className="text-gray-400 text-sm">Quel est le niveau de gravité ?</p>
            </div>

            <div className="space-y-3">
              {SEVERITY_OPTIONS.map(opt => (
                <button
                  key={opt.level}
                  onClick={() => setSeverity(opt.level)}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 transition-all min-h-[56px] ${
                    severity === opt.level
                      ? `${opt.activeColor} ${opt.border} ${opt.textColor} shadow-lg scale-[1.02]`
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0 ${
                    severity === opt.level ? 'bg-white/20' : 'bg-gray-700 text-gray-500'
                  }`}>
                    {opt.level}
                  </span>
                  <span className="text-base font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── STEP 3: Optional details + submit ───────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold text-lg mb-1">Détails (optionnel)</h2>
              <p className="text-gray-400 text-sm">Ajoutez une description rapide</p>
            </div>

            {/* Summary card */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-gray-500 text-xs">Machine</p>
                  <p className="text-white font-semibold">{selectedMachine?.code_interne || selectedMachine?.nom}</p>
                </div>
                <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                  SEVERITY_OPTIONS[severity - 1]?.activeColor || 'bg-gray-600'
                } text-white`}>
                  {SEVERITY_OPTIONS[severity - 1]?.label}
                </span>
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">Description rapide</label>
              <input
                type="text"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Ex: Bruit anormal, vibration..."
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 min-h-[48px]"
                maxLength={200}
              />
            </div>

            {/* Medias (photos + vidéos) */}
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">Photos / vidéos (optionnel)</label>
              <MediaUploader
                medias={medias}
                onChange={setMedias}
                canEdit={true}
                label="Pièces jointes au signalement"
              />
              <p className="text-gray-600 text-[10px] mt-1.5">
                JPG, PNG, GIF, WEBP, MP4, WEBM, MOV — max 50 Mo par fichier
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom action bar ───────────────────────────────────── */}
      <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 shrink-0 safe-bottom">
        {step < 3 ? (
          <button
            onClick={goNext}
            disabled={!canAdvance()}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors text-base min-h-[48px]"
          >
            Suivant
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition-colors text-base min-h-[48px] flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                Envoi en cours...
              </>
            ) : (
              'Envoyer le signalement'
            )}
          </button>
        )}
      </div>
    </div>
  )
}