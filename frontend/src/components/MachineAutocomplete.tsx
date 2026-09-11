/**
 * MachineAutocomplete — input avec suggestions en temps réel pour sélectionner
 * une machine par nom ou code_interne. Remplace le <select> qui obligeait à
 * scroller des centaines de machines.
 */
import { useState, useRef, useEffect } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'

interface Machine {
  id: number
  nom: string
  code_interne?: string | null
  zone?: string | null
  ligne?: string | null
}

interface Props {
  machines: Machine[]
  value: string  // machine_id as string
  onChange: (id: string) => void
  placeholder?: string
}

export default function MachineAutocomplete({ machines, value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Si une valeur est déjà sélectionnée, afficher le nom de la machine
  const selectedMachine = machines.find(m => String(m.id) === value)

  // Filtrer les machines selon la requête
  const filtered = query
    ? machines.filter(m => {
        const q = query.toLowerCase()
        return (
          (m.nom || '').toLowerCase().includes(q) ||
          (m.code_interne || '').toLowerCase().includes(q) ||
          (m.zone || '').toLowerCase().includes(q) ||
          (m.ligne || '').toLowerCase().includes(q)
        )
      }).slice(0, 10)  // max 10 résultats
    : machines.slice(0, 10)  // 10 premières machines par défaut quand focus

  // Reset query quand on change de machine
  useEffect(() => {
    if (selectedMachine) {
      setQuery(selectedMachine.nom)
    } else {
      setQuery('')
    }
  }, [value, selectedMachine])

  const handleSelect = (machine: Machine) => {
    onChange(String(machine.id))
    setQuery(machine.nom)
    setFocused(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!focused) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && focused && filtered[highlightIdx]) {
      e.preventDefault()
      handleSelect(filtered[highlightIdx])
    } else if (e.key === 'Escape') {
      setFocused(false)
      if (selectedMachine) setQuery(selectedMachine.nom)
    }
  }

  // Scroll vers l'élément highlighté
  useEffect(() => {
    if (!dropdownRef.current) return
    const el = dropdownRef.current.children[highlightIdx] as HTMLElement
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setHighlightIdx(0)
          if (!e.target.value) onChange('')
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Tapez le nom ou code de la machine...'}
        className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
        autoComplete="off"
      />
      {selectedMachine && (
        <button
          type="button"
          onClick={() => { onChange(''); setQuery(''); inputRef.current?.focus() }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
          title="Effacer"
        >
          <X size={14} />
        </button>
      )}

      {/* Dropdown suggestions */}
      {focused && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto"
        >
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(m) }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                i === highlightIdx ? 'bg-orange-500/20 text-orange-300' : 'text-gray-300 hover:bg-gray-700'
              } ${String(m.id) === value ? 'border-l-2 border-orange-500' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{m.nom}</span>
                {m.code_interne && (
                  <span className="text-xs text-gray-500 font-mono shrink-0">{m.code_interne}</span>
                )}
              </div>
              {(m.zone || m.ligne) && (
                <div className="text-[10px] text-gray-600 mt-0.5">
                  {[m.zone, m.ligne].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Feedback machine sélectionnée */}
      {selectedMachine && !focused && (
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span className="bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">
            ✓ {selectedMachine.code_interne || selectedMachine.nom}
          </span>
          {selectedMachine.zone && <span>{selectedMachine.zone}</span>}
        </div>
      )}
    </div>
  )
}
