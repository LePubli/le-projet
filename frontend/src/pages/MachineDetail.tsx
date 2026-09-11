import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  ArrowLeft, AlertTriangle, ClipboardList, QrCode, X,
  MapPin, Layers, Clock, Wrench, FileText, CheckCircle2,
  Plus, Search, Download
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── QrCodeImage : charge le QR code via axios (avec token) ───
function QrCodeImage({ machineId, codeInterne }: { machineId: number; codeInterne: string }) {
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/machines/${machineId}/qr-code`, { responseType: 'text' })
      .then(res => {
        setQrSvg(res.data)
      })
      .catch(() => toast.error('Erreur lors du chargement du QR code'))
      .finally(() => setLoading(false))
  }, [machineId])

  const handleDownload = () => {
    if (!qrSvg) return
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qr_${codeInterne}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="w-full h-48 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" /></div>
  if (!qrSvg) return <p className="text-red-400 text-sm text-center py-8">QR code indisponible</p>

  return (
    <>
      <div className="w-full rounded-lg bg-white p-4" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <button
        onClick={handleDownload}
        className="mt-3 w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
      >
        <Download size={16} /> Télécharger le QR code
      </button>
    </>
  )
}

// ─── Types ────────────────────────────────────────────────────────
interface MachineData {
  id: number; nom: string; site: string | null; ligne: string | null
  zone: string | null; etage: number | null; fabricant: string | null
  modele: string | null; code_interne: string | null; statut: string
  qr_code: string | null; notes: string | null; pos_x: number | null; pos_y: number | null
}

interface PanneItem {
  id: number; titre: string; criticite: number; cause_reelle: string | null
  solution: string | null; protocole_reparation: string | null
  temps_moyen_reparation: number | null; created_at: string
}

interface BTItem {
  id: number; technicien: string; duree: number | null; commentaire: string | null
  type_bt: string; statut: string; validee: boolean; validee_par: string | null
  date_intervention: string; created_at: string; photos_avant: string[]; photos_apres: string[]
}

// ─── Constants ────────────────────────────────────────────────────
const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  operationnel: { label: 'Opérationnel', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', dot: 'bg-green-500' },
  en_panne: { label: 'En panne', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', dot: 'bg-red-500' },
  maintenance: { label: 'Maintenance', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', dot: 'bg-yellow-500' },
  arret: { label: 'À l\'arrêt', color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/30', dot: 'bg-gray-500' },
}

const BT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  reparation: { label: 'Réparation', color: 'text-red-400 bg-red-900/30', icon: '🔧' },
  nettoyage: { label: 'Nettoyage', color: 'text-blue-400 bg-blue-900/30', icon: '🧹' },
  entretien: { label: 'Entretien', color: 'text-green-400 bg-green-900/30', icon: '⚙️' },
}

const BT_STATUT_CONFIG: Record<string, { label: string; color: string }> = {
  en_cours: { label: 'En cours', color: 'text-yellow-400' },
  termine: { label: 'Terminé', color: 'text-blue-400' },
  valide: { label: 'Validé', color: 'text-green-400' },
}

export default function MachineDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  const [machine, setMachine] = useState<MachineData | null>(null)
  const [pannes, setPannes] = useState<PanneItem[]>([])
  const [bts, setBts] = useState<BTItem[]>([])
  const [showQr, setShowQr] = useState(false)
  const [activeTab, setActiveTab] = useState<'pannes' | 'bt' | 'historique'>('pannes')
  const [searchPanne, setSearchPanne] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get(`/machines/${id}`),
      api.get(`/pannes/?machine_id=${id}&limit=50`),
      api.get(`/interventions/?machine_id=${id}&limit=50`),
    ]).then(([m, p, i]) => {
      setMachine(m.data)
      setPannes(p.data)
      setBts(i.data)
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" /></div>
  if (!machine) return <div className="p-6 text-gray-400">Machine introuvable</div>

  const statut = STATUT_CONFIG[machine.statut] || STATUT_CONFIG.operationnel
  const pannesResolues = pannes.filter(p => p.solution)
  const avgRepairTime = pannesResolues.length > 0
    ? Math.round(pannesResolues.reduce((a, p) => a + (p.temps_moyen_reparation || 0), 0) / pannesResolues.length)
    : null

  const filteredPannes = searchPanne
    ? pannes.filter(p => p.titre.toLowerCase().includes(searchPanne.toLowerCase()) || (p.solution || '').toLowerCase().includes(searchPanne.toLowerCase()))
    : pannes

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto pb-24 sm:pb-6">
      <button onClick={() => navigate('/machines')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 text-sm transition-colors">
        <ArrowLeft size={16} /> Retour aux machines
      </button>

      {/* Header card */}
      <div className={`rounded-xl border p-4 sm:p-6 mb-5 ${statut.bg}`}>
        <div className="flex items-start justify-between flex-wrap gap-3 sm:gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gray-800 rounded-2xl flex items-center justify-center border border-gray-700 shrink-0">
              <span className="text-2xl font-bold text-orange-400">{machine.nom[0]}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{machine.nom}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                {machine.code_interne && <span className="font-mono bg-gray-800 px-2 py-0.5 rounded">{machine.code_interne}</span>}
                {machine.ligne && <span className="flex items-center gap-1"><FileText size={12} /> {machine.ligne}</span>}
                {machine.zone && <span className="flex items-center gap-1"><MapPin size={12} /> {machine.zone}</span>}
                {machine.etage != null && <span className="flex items-center gap-1"><Layers size={12} /> Étage {machine.etage}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowQr(true)} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">
              <QrCode size={14} /> QR Code
            </button>
            <span className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${statut.bg} ${statut.color}`}>
              <span className={`w-2 h-2 rounded-full ${statut.dot}`} />
              {statut.label}
            </span>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-5 border-t border-gray-700/50">
          {[
            { label: 'Site', value: machine.site },
            { label: 'Fabricant', value: machine.fabricant },
            { label: 'Modèle', value: machine.modele },
            { label: 'Pannes', value: `${pannes.length} (${pannes.filter(p => p.criticite >= 4).length} critiques)` },
            { label: 'Temps moyen réparation', value: avgRepairTime ? `${avgRepairTime} min` : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-500 mb-0.5">{label}</p>
              <p className="text-sm text-white font-medium">{value || '—'}</p>
            </div>
          ))}
        </div>

        {machine.notes && (
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <p className="text-xs text-gray-400 mb-1">Notes</p>
            <p className="text-sm text-gray-300">{machine.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 bg-gray-800 border border-gray-700 rounded-lg p-1 w-fit">
        {([
          { key: 'pannes', label: 'Pannes', count: pannes.length, icon: AlertTriangle, color: 'text-red-400' },
          { key: 'bt', label: 'Bons de Travail', count: bts.length, icon: ClipboardList, color: 'text-blue-400' },
          { key: 'historique', label: 'Solutions rapides', count: pannesResolues.length, icon: CheckCircle2, color: 'text-green-400' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            <tab.icon size={14} className={activeTab === tab.key ? 'text-white' : tab.color} />
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-700 text-gray-400'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Panne tab */}
      {activeTab === 'pannes' && (
        <div className="space-y-3">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={searchPanne} onChange={e => setSearchPanne(e.target.value)}
              placeholder="Filtrer les pannes..."
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500" />
          </div>
          {filteredPannes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune panne enregistrée</p>
            </div>
          ) : (
            filteredPannes.map(p => (
              <div key={p.id} onClick={() => navigate(`/pannes/${p.id}`)}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 cursor-pointer transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
                        p.criticite >= 4 ? 'bg-red-900/50 text-red-400' : p.criticite >= 3 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-green-900/50 text-green-400'
                      }`}>{p.criticite}</span>
                      <h3 className="text-white font-medium text-sm">{p.titre}</h3>
                      {p.solution && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={10} /> Résolu</span>}
                    </div>
                    {p.cause_reelle && <p className="text-xs text-gray-400 mt-1">Cause : {p.cause_reelle}</p>}
                    {p.solution && (
                      <p className="text-xs text-green-300/70 mt-1 line-clamp-1">Solution : {p.solution}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString('fr-FR')}</p>
                    {p.temps_moyen_reparation && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-end gap-1"><Clock size={10} /> {p.temps_moyen_reparation} min</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* BT tab */}
      {activeTab === 'bt' && (
        <div className="space-y-3">
          {bts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun bon de travail enregistré</p>
              {canEdit && (
                <button onClick={() => navigate('/interventions')} className="mt-3 text-orange-400 hover:text-orange-300 text-sm">
                  <Plus size={12} className="inline mr-1" /> Créer un BT
                </button>
              )}
            </div>
          ) : (
            bts.map(bt => {
              const typeConfig = BT_TYPE_CONFIG[bt.type_bt] || BT_TYPE_CONFIG.reparation
              const statutConfig = BT_STATUT_CONFIG[bt.statut] || BT_STATUT_CONFIG.en_cours
              return (
                <div key={bt.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-lg`}>{typeConfig.icon}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                        <span className={`text-xs ${statutConfig.color}`}>● {statutConfig.label}</span>
                        {bt.validee && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={10} /> Validé par {bt.validee_par}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mb-1">
                        <span className="text-white font-medium">{bt.technicien}</span>
                        {bt.duree && <span className="flex items-center gap-1"><Clock size={10} /> {bt.duree} min</span>}
                        <span>{new Date(bt.date_intervention).toLocaleDateString('fr-FR')}</span>
                      </div>
                      {bt.commentaire && <p className="text-xs text-gray-300 mt-1">{bt.commentaire}</p>}
                      {/* Photos */}
                      {(bt.photos_avant?.length > 0 || bt.photos_apres?.length > 0) && (
                        <div className="flex gap-2 mt-2">
                          {bt.photos_avant?.map((photo, i) => (
                            <img key={`av-${i}`} src={photo} alt="Avant" className="w-12 h-12 rounded-lg object-cover border border-gray-600" />
                          ))}
                          {bt.photos_apres?.map((photo, i) => (
                            <img key={`ap-${i}`} src={photo} alt="Après" className="w-12 h-12 rounded-lg object-cover border border-gray-600" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Historique / Solutions rapides tab */}
      {activeTab === 'historique' && (
        <div className="space-y-3">
          {pannesResolues.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Wrench size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune solution documentée pour le moment</p>
            </div>
          ) : (
            pannesResolues.map(p => (
              <div key={p.id} onClick={() => navigate(`/pannes/${p.id}`)}
                className="bg-gray-800 border border-green-800/30 rounded-xl p-4 hover:border-green-700/50 cursor-pointer transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                  <h3 className="text-white font-medium text-sm">{p.titre}</h3>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    p.criticite >= 4 ? 'bg-red-900/50 text-red-400' : 'bg-gray-700 text-gray-400'
                  }`}>Niv. {p.criticite}</span>
                </div>
                {p.cause_reelle && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-0.5">Cause identifiée :</p>
                    <p className="text-xs text-yellow-300 bg-yellow-900/20 rounded px-2 py-1">{p.cause_reelle}</p>
                  </div>
                )}
                {p.solution && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-0.5">Solution appliquée :</p>
                    <p className="text-xs text-green-200 bg-green-900/20 rounded px-2 py-1">{p.solution}</p>
                  </div>
                )}
                {p.protocole_reparation && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Procédure :</p>
                    <p className="text-xs text-blue-200 bg-blue-900/20 rounded px-2 py-1 line-clamp-3">{p.protocole_reparation}</p>
                  </div>
                )}
                <p className="text-xs text-gray-600 mt-2">{new Date(p.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* QR Modal */}
      {showQr && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowQr(false)}>
          <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4 border border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">QR Code — {machine.nom}</h3>
              <button onClick={() => setShowQr(false)}><X size={18} className="text-gray-400 hover:text-white" /></button>
            </div>
            <QrCodeImage machineId={machine.id} codeInterne={machine.code_interne || String(machine.id)} />
            <p className="text-center text-xs text-gray-500 mt-3">
              Imprimez ce QR code et collez-le sur l'équipement pour un accès rapide
            </p>
          </div>
        </div>
      )}
    </div>
  )
}