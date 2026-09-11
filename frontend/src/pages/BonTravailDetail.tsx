/* frontend/src/pages/BonTravailDetail.tsx — Vue détail style BT TRIselec
   Affiche : en-tête, arborescence, gammes (checkables), pièces, compteurs, visa
   Actions : modifier statut, imprimer, générer PDF, envoyer par email
*/
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import MediaUploader, { type MediaItem } from '../components/MediaUploader'
import { SignaturePad } from '../components/ExtraFeatures'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Printer, FileDown, Mail, Edit3, Save, X, Plus, Trash2,
  CheckCircle2, Circle, Shield, Lock
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
interface Gamme {
  id: number; ordre: number; code_gamme: string | null; famille_gamme: string | null
  texte_gamme: string; consignation: boolean; condamnation: boolean
  completed: boolean; duree_estimee_h: number | null
}
interface Piece {
  id: number; reference: string | null; designation: string | null
  quantite: number | null; cout_unitaire: number | null; cout_ligne: number | null
}
interface Compteur {
  id: number; nom_compteur: string | null; valeur: number | null
  cumul: number | null; releve: number | null; val_courante: number | null
}
interface Visa { id: number; role: string | null; nom: string | null; visa: string | null; date_visa: string | null }

interface BTDetail {
  id: number; numero: string; type_bt: string; statut: string; titre: string
  description: string | null; machine_id: number | null; arborescence: string | null
  date_creation: string | null; date_debut_prevue: string | null; date_debut_reelle: string | null
  date_fin_prevue: string | null; date_cloture: string | null
  demandeur_id: number | null; intervenant_id: number | null
  degre_urgence: string | null; famille: string | null
  duree_immobilisation_h: number | null; cout_total: number | null; temps_reaction_h: number | null
  compte_rendu: string | null; calendrier_id: number | null
  cause_medias?: MediaItem[]; solution_medias?: MediaItem[]
  gammes: Gamme[]; pieces: Piece[]; compteurs: Compteur[]; visas: Visa[]
}

const STATUT_STEPS = ['à faire', 'en cours', 'terminé', 'clôturé']
const STATUT_COLORS: Record<string, string> = {
  'à faire': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'en cours': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'terminé': 'bg-green-500/15 text-green-400 border-green-500/30',
  'clôturé': 'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const fmtDateShort = (d: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function BonTravailDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const printRef = useRef<HTMLDivElement>(null)

  const [bt, setBt] = useState<BTDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingCR, setEditingCR] = useState(false)
  const [crText, setCrText] = useState('')
  const [showNewGamme, setShowNewGamme] = useState(false)
  const [newGammeText, setNewGammeText] = useState('')
  const [newGammeCode, setNewGammeCode] = useState('')
  const [newGammeFamille, setNewGammeFamille] = useState('')
  const [newGammeConsignation, setNewGammeConsignation] = useState(false)
  const [newGammeCondamnation, setNewGammeCondamnation] = useState(false)

  const fetchBT = useCallback(async () => {
    try {
      const res = await api.get(`/bons-travail/${id}`)
      setBt(res.data)
      setCrText(res.data.compte_rendu || '')
    } catch { toast.error('BT non trouvé') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchBT() }, [fetchBT])

  // ─── Statut transition ─────────────────────────────────────
  const advanceStatut = async () => {
    if (!bt) return
    const idx = STATUT_STEPS.indexOf(bt.statut)
    if (idx >= STATUT_STEPS.length - 1) return
    const next = STATUT_STEPS[idx + 1]
    const payload: Record<string, unknown> = { statut: next }
    if (next === 'en cours') payload.date_debut_reelle = new Date().toISOString()
    if (next === 'clôturé') payload.date_cloture = new Date().toISOString()
    try {
      await api.put(`/bons-travail/${bt.id}`, payload)
      toast.success(`Statut → ${next}`)
      fetchBT()
    } catch { toast.error('Erreur mise à jour statut') }
  }

  // ─── Save compte rendu ─────────────────────────────────────
  const saveCR = async () => {
    if (!bt) return
    try {
      await api.put(`/bons-travail/${bt.id}`, { compte_rendu: crText })
      setEditingCR(false)
      toast.success('Compte rendu sauvegardé')
      fetchBT()
    } catch { toast.error('Erreur sauvegarde') }
  }

  // ─── Toggle gamme completed ────────────────────────────────
  const toggleGamme = async (g: Gamme) => {
    try {
      await api.put(`/bons-travail/${bt!.id}/gammes/${g.id}`, { completed: !g.completed })
      fetchBT()
    } catch { toast.error('Erreur mise à jour gamme') }
  }

  // ─── Add gamme ─────────────────────────────────────────────
  const addGamme = async () => {
    if (!newGammeText.trim() || !bt) return
    try {
      const ordre = bt.gammes.length + 1
      await api.post(`/bons-travail/${bt.id}/gammes`, {
        ordre, texte_gamme: newGammeText, code_gamme: newGammeCode || null,
        famille_gamme: newGammeFamille || null,
        consignation: newGammeConsignation, condamnation: newGammeCondamnation,
      })
      setShowNewGamme(false)
      setNewGammeText('')
      setNewGammeCode('')
      setNewGammeFamille('')
      setNewGammeConsignation(false)
      setNewGammeCondamnation(false)
      toast.success('Gamme ajoutée')
      fetchBT()
    } catch { toast.error('Erreur ajout gamme') }
  }

  // ─── Delete gamme ──────────────────────────────────────────
  const deleteGamme = async (g: Gamme) => {
    if (!bt) return
    try {
      await api.delete(`/bons-travail/${bt.id}/gammes/${g.id}`)
      toast.success('Gamme supprimée')
      fetchBT()
    } catch { toast.error('Erreur suppression') }
  }

  // ─── Print ─────────────────────────────────────────────────
  const handlePrint = () => {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>${bt?.numero || 'BT'}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .bt-header { border: 2px solid #333; padding: 12px; margin-bottom: 12px; }
        .bt-header table { width: 100%; border-collapse: collapse; }
        .bt-header td { padding: 3px 8px; border: 1px solid #ccc; font-size: 11px; }
        .bt-header .label { background: #eee; font-weight: bold; width: 140px; }
        .section { border: 1px solid #999; margin-bottom: 12px; }
        .section-title { background: #ddd; font-weight: bold; padding: 4px 8px; font-size: 12px; }
        .gammes-table { width: 100%; border-collapse: collapse; }
        .gammes-table th, .gammes-table td { border: 1px solid #ccc; padding: 4px 6px; font-size: 11px; text-align: left; }
        .gammes-table th { background: #f5f5f5; }
        .check { color: ${bt?.statut === 'clôturé' ? 'green' : '#999'}; }
        .hidden-print { display: none; }
        .footer { margin-top: 20px; font-size: 10px; color: #666; text-align: right; }
      </style></head><body>${content}</body></html>`)
    win.document.close()
    win.print()
  }

  // ─── PDF generation (backend) ──────────────────────────────
  const handlePDF = async () => {
    try {
      const res = await api.get(`/bons-travail/${id}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url; link.download = `${bt?.numero || 'BT'}.pdf`; link.click()
      window.URL.revokeObjectURL(url)
      toast.success('PDF généré')
    } catch {
      toast.error('Erreur génération PDF — endpoint pas encore configuré')
    }
  }

  // ─── Email ─────────────────────────────────────────────────
  const handleEmail = async () => {
    if (!bt) return
    try {
      await api.post(`/bons-travail/${id}/email`)
      toast.success('BT envoyé par email')
    } catch {
      toast.error("Erreur envoi email — vérifier la configuration SMTP")
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
    </div>
  )
  if (!bt) return null

  const gammesDone = bt.gammes.filter(g => g.completed).length
  const gammesTotal = bt.gammes.length
  const progress = gammesTotal > 0 ? Math.round((gammesDone / gammesTotal) * 100) : 0

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 text-sm">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="flex-1" />
        <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 text-sm">
          <Printer size={16} /> Imprimer
        </button>
        <button onClick={handlePDF} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 text-sm">
          <FileDown size={16} /> PDF
        </button>
        <button onClick={handleEmail} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 text-sm">
          <Mail size={16} /> Email
        </button>
        <button onClick={advanceStatut} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
          <CheckCircle2 size={16} /> {bt.statut === 'clôturé' ? 'Clôturé' : `Passer → ${STATUT_STEPS[STATUT_STEPS.indexOf(bt.statut) + 1] || 'Clôturé'}`}
        </button>
      </div>

      {/* ═══ Zone imprimable ═══ */}
      <div ref={printRef}>
        {/* En-tête BT style TRIselec */}
        <div className="border-2 border-gray-600 rounded-lg overflow-hidden bg-white text-gray-900">
          {/* Barre titre */}
          <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg">{bt.numero}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUT_COLORS[bt.statut]}`}>
                {bt.statut}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 uppercase">
                {bt.type_bt === 'entretien' ? 'Entretien' : 'Nettoyage'}
              </span>
            </div>
            <span className="text-xs text-gray-400">Type de travail Préventif</span>
          </div>

          {/* Info grid */}
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-0">
            <table className="w-full border-collapse">
              <tbody>
                <tr><td className="bg-gray-100 font-semibold px-3 py-2 border border-gray-300 w-40 text-sm">Titre</td>
                    <td className="px-3 py-2 border border-gray-300 text-sm font-bold">{bt.titre}</td></tr>
                <tr><td className="bg-gray-100 font-semibold px-3 py-2 border border-gray-300 text-sm">Degré d'urgence</td>
                    <td className="px-3 py-2 border border-gray-300 text-sm">{bt.degre_urgence || '—'}</td></tr>
                <tr><td className="bg-gray-100 font-semibold px-3 py-2 border border-gray-300 text-sm">Famille</td>
                    <td className="px-3 py-2 border border-gray-300 text-sm">{bt.famille || '—'}</td></tr>
                <tr><td className="bg-gray-100 font-semibold px-3 py-2 border border-gray-300 text-sm">Demandeur</td>
                    <td className="px-3 py-2 border border-gray-300 text-sm">{bt.demandeur_id || '—'}</td></tr>
              </tbody>
            </table>
            <table className="w-full border-collapse">
              <tbody>
                <tr><td className="bg-gray-100 font-semibold px-3 py-2 border border-gray-300 w-40 text-sm">Création</td>
                    <td className="px-3 py-2 border border-gray-300 text-sm">{fmtDate(bt.date_creation)}</td></tr>
                <tr><td className="bg-gray-100 font-semibold px-3 py-2 border border-gray-300 text-sm">Début prévu</td>
                    <td className="px-3 py-2 border border-gray-300 text-sm">{fmtDate(bt.date_debut_prevue)}</td></tr>
                <tr><td className="bg-gray-100 font-semibold px-3 py-2 border border-gray-300 text-sm">Début réel</td>
                    <td className="px-3 py-2 border border-gray-300 text-sm">{fmtDate(bt.date_debut_reelle)}</td></tr>
                <tr><td className="bg-gray-100 font-semibold px-3 py-2 border border-gray-300 text-sm">Fin prévue</td>
                    <td className="px-3 py-2 border border-gray-300 text-sm">{fmtDate(bt.date_fin_prevue)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Arborescence */}
          {bt.arborescence && (
            <div className="mx-4 mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              <span className="font-semibold text-amber-800">Arborescence :</span>{' '}
              <span className="text-amber-900">{bt.arborescence}</span>
            </div>
          )}

          {/* Progression */}
          {gammesTotal > 0 && (
            <div className="mx-4 mb-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Progression gammes</span>
                <span>{gammesDone}/{gammesTotal} ({progress}%)</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* ═══ Gammes ═══ */}
        <div className="border border-gray-600 rounded-lg overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center justify-between">
            <span className="font-semibold text-sm">Gammes d'opérations</span>
            <span className="text-xs text-gray-400">{gammesDone}/{gammesTotal} faites</span>
          </div>
          <div className="divide-y divide-gray-700">
            {bt.gammes.map(g => (
              <div key={g.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-800/30 transition-colors ${g.completed ? 'opacity-60' : ''}`}>
                <button onClick={() => toggleGamme(g)} className="mt-0.5 shrink-0 hidden-print">
                  {g.completed
                    ? <CheckCircle2 size={20} className="text-green-500" />
                    : <Circle size={20} className="text-gray-500 hover:text-blue-400" />
                  }
                </button>
                <span className={`mt-0.5 shrink-0 print:check ${g.completed ? 'text-green-600' : 'text-gray-400'}`}>
                  {g.completed ? '☑' : '☐'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {g.consignation && <Lock size={12} className="text-orange-500" />}
                    {g.condamnation && <Shield size={12} className="text-red-500" />}
                    {g.code_gamme && <span className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">{g.code_gamme}</span>}
                    {g.famille_gamme && <span className="text-[10px] text-gray-500">{g.famille_gamme}</span>}
                    <span className="text-xs text-gray-500">#{g.ordre}</span>
                  </div>
                  <p className={`text-sm mt-0.5 ${g.completed ? 'line-through text-gray-500' : 'text-white'}`}>{g.texte_gamme}</p>
                </div>
                {g.duree_estimee_h && (
                  <span className="text-[10px] text-gray-500 shrink-0">{g.duree_estimee_h}h</span>
                )}
                <button onClick={() => deleteGamme(g)} className="shrink-0 text-gray-600 hover:text-red-400 hidden-print" title="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {/* New gamme form */}
            {showNewGamme && (
              <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <input value={newGammeCode} onChange={e => setNewGammeCode(e.target.value)} placeholder="Code (ex: LUB 2)"
                    className="w-24 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs" />
                  <input value={newGammeFamille} onChange={e => setNewGammeFamille(e.target.value)} placeholder="Famille"
                    className="w-32 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs" />
                  <label className="flex items-center gap-1 text-xs text-gray-400">
                    <input type="checkbox" checked={newGammeConsignation} onChange={e => setNewGammeConsignation(e.target.checked)} /> Consign.
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-400">
                    <input type="checkbox" checked={newGammeCondamnation} onChange={e => setNewGammeCondamnation(e.target.checked)} /> Condamn.
                  </label>
                </div>
                <div className="flex gap-2">
                  <input value={newGammeText} onChange={e => setNewGammeText(e.target.value)} placeholder="Description de l'étape..."
                    className="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
                  <button onClick={addGamme} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded font-medium">Ajouter</button>
                  <button onClick={() => setShowNewGamme(false)} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {!showNewGamme && (
              <button onClick={() => setShowNewGamme(true)}
                className="w-full px-4 py-2.5 text-blue-400 hover:bg-blue-500/10 text-xs font-medium hidden-print">
                <Plus size={14} className="inline mr-1" /> Ajouter une étape
              </button>
            )}
          </div>
        </div>

        {/* ═══ Pièces ═══ */}
        <div className="border border-gray-600 rounded-lg overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-2.5 font-semibold text-sm">
            Pièces utilisées
          </div>
          {bt.pieces.length > 0 ? (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-700">
                <th className="px-4 py-2 text-left">Référence</th>
                <th className="px-4 py-2 text-left">Désignation</th>
                <th className="px-4 py-2 text-center">Qté</th>
                <th className="px-4 py-2 text-right">Coût unit.</th>
                <th className="px-4 py-2 text-right">Coût ligne</th>
              </tr></thead>
              <tbody>
                {bt.pieces.map(p => (
                  <tr key={p.id} className="border-b border-gray-800">
                    <td className="px-4 py-2 text-gray-300 font-mono text-xs">{p.reference || '—'}</td>
                    <td className="px-4 py-2 text-white">{p.designation || '—'}</td>
                    <td className="px-4 py-2 text-center text-gray-300">{p.quantite || 0}</td>
                    <td className="px-4 py-2 text-right text-gray-300">{p.cout_unitaire?.toFixed(2)} €</td>
                    <td className="px-4 py-2 text-right text-white font-medium">{p.cout_ligne?.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-gray-600">
                <td colSpan={4} className="px-4 py-2 text-right font-semibold text-gray-400">Coût total pièces</td>
                <td className="px-4 py-2 text-right font-bold text-white">{bt.cout_total?.toFixed(2)} €</td>
              </tr></tfoot>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-gray-600 text-sm">Aucune pièce déclarée</p>
          )}
        </div>

        {/* ═══ Compteurs ═══ */}
        {bt.compteurs.length > 0 && (
          <div className="border border-gray-600 rounded-lg overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-2.5 font-semibold text-sm">Compteurs</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-gray-700">
              {bt.compteurs.map(c => (
                <div key={c.id} className="p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{c.nom_compteur || 'Compteur'}</p>
                  <p className="text-lg font-bold text-white">{c.val_courante ?? '—'}</p>
                  <p className="text-[10px] text-gray-600">Cumul: {c.cumul ?? '—'} | Relevé: {c.releve ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Visa ═══ */}
        {bt.visas.length > 0 && (
          <div className="border border-gray-600 rounded-lg overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-2.5 font-semibold text-sm">Visa</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-700">
              {bt.visas.map(v => (
                <div key={v.id} className="p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">{v.role || 'Visa'}</p>
                  <p className="text-sm font-semibold text-white">{v.nom || '—'}</p>
                  <p className="text-[10px] text-gray-600 mt-1">{v.date_visa ? fmtDateShort(v.date_visa) : ''}</p>
                  <div className="mt-2 h-12 border-b border-gray-600 flex items-end justify-center">
                    <span className="text-lg italic text-gray-500">{v.visa || ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Compte rendu ═══ */}
        <div className="border border-gray-600 rounded-lg overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center justify-between">
            <span className="font-semibold text-sm">Compte rendu</span>
            {!editingCR && (user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technicien') && (
              <button onClick={() => setEditingCR(true)} className="text-blue-400 hover:text-blue-300 text-xs">
                <Edit3 size={14} className="inline mr-1" /> Modifier
              </button>
            )}
          </div>
          {editingCR ? (
            <div className="p-4 space-y-2">
              <textarea value={crText} onChange={e => setCrText(e.target.value)} rows={4}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Décrivez les interventions effectuées..." />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditingCR(false); setCrText(bt.compte_rendu || '') }}
                  className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Annuler</button>
                <button onClick={saveCR}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded">
                  <Save size={14} /> Sauvegarder
                </button>
              </div>
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-gray-300 whitespace-pre-wrap">{bt.compte_rendu || 'Aucun compte rendu'}</p>
          )}
        </div>

        {/* ═══ Médias (photos + vidéos) ═══ */}
        {(bt.cause_medias?.length || bt.solution_medias?.length) ? (
          <div className="border border-gray-600 rounded-lg overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-2.5 font-semibold text-sm">Médias (photos / vidéos)</div>
            <div className="p-4 space-y-4">
              {bt.cause_medias && bt.cause_medias.length > 0 && (
                <MediaUploader medias={bt.cause_medias} canEdit={false} label="Observations / état initial (avant travaux)" size="sm" />
              )}
              {bt.solution_medias && bt.solution_medias.length > 0 && (
                <MediaUploader medias={bt.solution_medias} canEdit={false} label="Résultat / état final (après travaux)" size="sm" />
              )}
            </div>
          </div>
        ) : null}

        {/* Signatures électroniques */}
        <div className="border border-gray-600 rounded-lg overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-2.5 font-semibold text-sm">Signatures électroniques</div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-2 font-medium">Intervenant</p>
              <SignaturePad btId={bt.id} role="intervenant" onSigned={() => { /* refresh */ }} />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2 font-medium">Responsable</p>
              <SignaturePad btId={bt.id} role="responsable" onSigned={() => { /* refresh */ }} />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2 font-medium">Contrôle qualité</p>
              <SignaturePad btId={bt.id} role="controle" onSigned={() => { /* refresh */ }} />
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-xs text-gray-600 px-2">
          <span>Durée immobilisation: {bt.duree_immobilisation_h ?? 0}h</span>
          <span>Temps de réaction: {bt.temps_reaction_h ?? 0}h</span>
          <span>Coût total: {bt.cout_total?.toFixed(2) ?? '0.00'} €</span>
        </div>
      </div>
    </div>
  )
}