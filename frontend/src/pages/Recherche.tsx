import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import {
  Search, Wrench, AlertTriangle, ClipboardList, Loader2, Mic, MicOff,
  BookOpen, FileText, Factory, ChevronRight,
} from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
const speechSupported = !!SpeechRecognition

interface SearchResult {
  machines: { id: number; nom: string; code_interne?: string; statut: string; ligne?: string; zone?: string }[]
  pannes: { id: number; titre: string; criticite: number; machine_id: number; machine_nom: string }[]
  interventions: { id: number; technicien: string; machine_id: number }[]
  bons_travail: { id: number; numero: string; titre: string; type_bt: string; statut: string }[]
  base_connaissances: { id: number; titre: string; cause_reelle: string; solution: string; criticite: number }[]
  lignes: string[]
}

/** Surligne les occurrences de la requête dans un texte */
function highlight(text: string | null | undefined, query: string): React.ReactNode {
  if (!text || !query) return text || ''
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-orange-500/30 text-orange-300 rounded px-0.5">{part}</mark>
      : part
  )
}

export default function Recherche() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const navigate = useNavigate()

  const toggleVoice = () => {
    if (!SpeechRecognition) return
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'fr-FR'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setQuery(transcript)
      setListening(false)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort()
    }
  }, [])

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults(null); return }
    const t = setTimeout(() => {
      setLoading(true)
      api.get(`/search/?q=${encodeURIComponent(query)}`)
        .then(r => setResults(r.data))
        .finally(() => setLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  const total = results
    ? results.machines.length + results.pannes.length + results.interventions.length +
      results.bons_travail.length + results.base_connaissances.length + results.lignes.length
    : 0

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto pb-24 sm:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Recherche globale</h1>
        <p className="text-gray-400 text-sm mt-1">
          Machines, pannes, BT, interventions, base de connaissances — tolérant aux fautes de frappe
        </p>
      </div>

      <div className="relative mb-6">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        {speechSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${listening ? 'bg-red-900/60 text-red-400 hover:bg-red-900/80' : 'text-gray-400 hover:text-white'}`}
            title={listening ? 'Arrêter la reconnaissance vocale' : 'Recherche vocale'}
          >
            {listening ? (
              <span className="relative flex items-center justify-center">
                <span className="absolute inline-flex h-6 w-6 rounded-full bg-red-500/40 animate-ping" />
                <MicOff size={16} className="relative" />
              </span>
            ) : (
              <Mic size={16} />
            )}
          </button>
        )}
        {!speechSupported || !listening ? loading && <Loader2 size={16} className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" /> : null}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Nom, code, panne, technicien, solution..."
          className={`w-full pl-11 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 ${speechSupported ? 'pr-12' : 'pr-10'}`}
          autoFocus
        />
      </div>

      {results && (
        <div>
          <p className="text-xs text-gray-500 mb-4">{total} résultat{total > 1 ? 's' : ''} pour « {query} »</p>

          {/* Machines */}
          {results.machines.length > 0 && (
            <Section icon={<Wrench size={13} />} title="Machines" count={results.machines.length}>
              {results.machines.map(m => (
                <button key={m.id} onClick={() => navigate(`/machines/${m.id}`)}
                  className="w-full text-left p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-orange-500 transition-colors flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{highlight(m.nom, query)}</p>
                    {m.code_interne && <p className="text-xs text-gray-400 font-mono mt-0.5">{highlight(m.code_interne, query)}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.zone && <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded">{m.zone}</span>}
                    <span className="text-xs text-gray-500">{m.statut}</span>
                    <ChevronRight size={14} className="text-gray-600" />
                  </div>
                </button>
              ))}
            </Section>
          )}

          {/* Lignes */}
          {results.lignes.length > 0 && (
            <Section icon={<Factory size={13} />} title="Lignes" count={results.lignes.length}>
              {results.lignes.map(l => (
                <button key={l} onClick={() => navigate(`/lignes/${encodeURIComponent(l)}`)}
                  className="w-full text-left p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-orange-500 transition-colors flex items-center gap-3">
                  <Factory size={16} className="text-orange-400 shrink-0" />
                  <span className="text-white font-medium flex-1">{highlight(l, query)}</span>
                  <ChevronRight size={14} className="text-gray-600" />
                </button>
              ))}
            </Section>
          )}

          {/* Pannes */}
          {results.pannes.length > 0 && (
            <Section icon={<AlertTriangle size={13} />} title="Pannes" count={results.pannes.length}>
              {results.pannes.map(p => (
                <button key={p.id} onClick={() => navigate(`/pannes/${p.id}`)}
                  className="w-full text-left p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-orange-500 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-medium truncate flex-1">{highlight(p.titre, query)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${p.criticite >= 4 ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                      Niv. {p.criticite}
                    </span>
                  </div>
                  {p.machine_nom && <p className="text-xs text-gray-400 mt-0.5">{highlight(p.machine_nom, query)}</p>}
                </button>
              ))}
            </Section>
          )}

          {/* Bons de Travail */}
          {results.bons_travail.length > 0 && (
            <Section icon={<ClipboardList size={13} />} title="Bons de Travail" count={results.bons_travail.length}>
              {results.bons_travail.map(bt => (
                <button key={bt.id} onClick={() => navigate(`/bons-travail/${bt.id}`)}
                  className="w-full text-left p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-orange-500 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-medium truncate flex-1">{highlight(bt.titre, query)}</p>
                    <span className="text-xs text-gray-500 font-mono shrink-0">{bt.numero}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{bt.type_bt === 'entretien' ? '🔧 Entretien' : '🧹 Nettoyage'}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-xs text-gray-500">{bt.statut}</span>
                  </div>
                </button>
              ))}
            </Section>
          )}

          {/* Base de connaissances */}
          {results.base_connaissances.length > 0 && (
            <Section icon={<BookOpen size={13} />} title="Base de connaissances" count={results.base_connaissances.length}>
              {results.base_connaissances.map(b => (
                <button key={b.id} onClick={() => navigate(`/pannes/${b.id}`)}
                  className="w-full text-left p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-orange-500 transition-colors">
                  <p className="text-white font-medium truncate">{highlight(b.titre, query)}</p>
                  {b.cause_reelle && <p className="text-xs text-yellow-300/70 mt-0.5 truncate">Cause: {highlight(b.cause_reelle, query)}</p>}
                  {b.solution && <p className="text-xs text-green-300/70 mt-0.5 truncate">Solution: {highlight(b.solution, query)}</p>}
                </button>
              ))}
            </Section>
          )}

          {/* Interventions */}
          {results.interventions.length > 0 && (
            <Section icon={<FileText size={13} />} title="Interventions" count={results.interventions.length}>
              {results.interventions.map(i => (
                <div key={i.id} className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                  <p className="text-white">{highlight(i.technicien, query)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Machine #{i.machine_id}</p>
                </div>
              ))}
            </Section>
          )}

          {total === 0 && (
            <div className="text-center py-10 text-gray-500">
              <Search size={32} className="mx-auto mb-2 opacity-30" />
              <p>Aucun résultat pour « {query} »</p>
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="text-center py-16 text-gray-600">
          <Search size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Entrez au moins 2 caractères pour rechercher</p>
          <p className="text-xs text-gray-700 mt-2">Tolérant aux fautes de frappe (ex: « l315 » trouve « L315 »)</p>
        </div>
      )}
    </div>
  )
}

function Section({ icon, title, count, children }: {
  icon: React.ReactNode; title: string; count: number; children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-2">
        {icon} {title} ({count})
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
