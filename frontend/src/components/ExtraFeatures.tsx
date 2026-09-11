/**
 * Composants pour les fonctionnalités C à J:
 * - SignaturePad : canvas tactile pour signature électronique BT (J)
 * - ChatPanel : messagerie interne sur panne (E)
 * - StockAlertBadge : indicateur d'alerte stock (I)
 * - ThemeToggle : mode sombre/clair (C)
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { Pen, Eraser, Check, X, Send, MessageCircle, AlertTriangle, Sun, Moon } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
//  J — SignaturePad : canvas tactile pour signature BT
// ═══════════════════════════════════════════════════════════════
export function SignaturePad({ btId, role, onSigned }: {
  btId: number; role: string; onSigned?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [saving, setSaving] = useState(false)

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.moveTo(x, y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }

  const stopDraw = () => setDrawing(false)

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const save = async () => {
    const canvas = canvasRef.current
    if (!canvas || !hasSignature) return
    setSaving(true)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      await api.post(`/extra/bt/${btId}/signature`, {
        signature_data: dataUrl,
        role,
      })
      toast.success('Signature enregistrée')
      clear()
      onSigned?.()
    } catch {
      toast.error('Erreur lors de la signature')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="relative bg-white rounded-lg overflow-hidden border border-gray-600">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="w-full touch-none cursor-crosshair"
          style={{ aspectRatio: '400/150' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!hasSignature && (
          <p className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
            ✍️ Signez ici avec votre doigt ou la souris
          </p>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={clear} className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs">
          <Eraser size={14} /> Effacer
        </button>
        <button
          onClick={save}
          disabled={!hasSignature || saving}
          className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
        >
          <Check size={14} /> {saving ? 'Sauvegarde...' : 'Valider'}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  E — ChatPanel : messagerie interne sur panne
// ═══════════════════════════════════════════════════════════════
interface ChatMsg {
  user: string; role: string; message: string; timestamp: string
}

export function ChatPanel({ panneId }: { panneId: number }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get(`/extra/chat/${panneId}`).then(r => setMessages(r.data.messages)).catch(() => {}).finally(() => setLoading(false))
  }, [panneId])

  useEffect(() => { fetch() }, [fetch])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMsg.trim()) return
    try {
      const res = await api.post(`/extra/chat/${panneId}`, { message: newMsg.trim() })
      setMessages(prev => [...prev, res.data.message])
      setNewMsg('')
    } catch {
      toast.error('Erreur envoi message')
    }
  }

  if (loading) return null

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-3">
      <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
        <MessageCircle size={14} /> Discussion ({messages.length})
      </h3>
      <div className="space-y-2 max-h-48 overflow-y-auto mb-2">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-600 italic text-center py-3">Aucun message. Démarrez la discussion.</p>
        ) : messages.map((m, i) => (
          <div key={i} className="text-xs">
            <span className={`font-medium ${m.role === 'admin' ? 'text-purple-400' : m.role === 'manager' ? 'text-blue-400' : m.role === 'chef_equipe' ? 'text-teal-400' : 'text-gray-400'}`}>
              {m.user}
            </span>
            <span className="text-gray-600 ml-1.5">{new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            <p className="text-gray-300 ml-1">{m.message}</p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          type="text"
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          placeholder="Votre message..."
          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:border-orange-500"
        />
        <button type="submit" disabled={!newMsg.trim()} className="p-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg">
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  I — StockAlertBadge : badge d'alerte stock
// ═══════════════════════════════════════════════════════════════
export function StockAlertBadge({ stock, seuil }: { stock: number; seuil?: number | null }) {
  if (!seuil || seuil <= 0) return null
  if (stock === 0) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/50 text-red-400 border border-red-700/50">Rupture</span>
  }
  if (stock <= seuil) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/50 text-amber-400 border border-amber-700/50">Stock bas</span>
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
//  C — ThemeToggle : mode sombre/clair
// ═══════════════════════════════════════════════════════════════
export function ThemeToggle() {
  const [lightMode, setLightMode] = useState(() => {
    try { return localStorage.getItem('trimaint_light_mode') === '1' } catch { return false }
  })

  const toggle = () => {
    const next = !lightMode
    setLightMode(next)
    try { localStorage.setItem('trimaint_light_mode', next ? '1' : '0') } catch { /* ignore */ }
    // Appliquer le filtre CSS sur tout le body
    if (next) {
      document.documentElement.style.filter = 'invert(0.92) hue-rotate(180deg) brightness(1.05) contrast(0.95)'
      // Exclure les images et vidéos du filtre
      document.documentElement.style.setProperty('--img-filter', 'invert(0.92) hue-rotate(180deg) brightness(1.05) contrast(0.95)')
    } else {
      document.documentElement.style.filter = ''
      document.documentElement.style.removeProperty('--img-filter')
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
      title={lightMode ? 'Mode sombre' : 'Mode clair'}
    >
      {lightMode ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  )
}
