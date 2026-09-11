import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import {
  ZoomIn, ZoomOut, Maximize2, ArrowLeft,
  Search, X, Filter, MapPin, Layers, AlertTriangle,
  Thermometer, Pencil, Save, GripVertical, Trash2, Plus, Palette, CheckSquare, Square,
  MoreHorizontal, ChevronRight, Crosshair
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════
   TriMaint – Schéma Interactif v2.3
   Ajout/suppression pastilles · Zoom centré doux · Couleur/taille
   ═══════════════════════════════════════════════════════════════════ */

// ─── Types ────────────────────────────────────────────────────────
interface SchemaMachine {
  id: number; nom: string; code_interne: string | null; statut: string
  zone: string | null; etage: number | null; ligne: string | null
  pos_x: number | null; pos_y: number | null; type: string
  modele?: string | null; couleur?: string | null; taille_pastille?: number | null
  rotation?: number | null
}
interface SchemaData {
  machines: SchemaMachine[]; zones: string[]; etages: number[]; lignes: string[]
}
interface HeatmapZoneData { open_pannes: number; recent_pannes: number; avg_criticite: number }
interface HeatmapMachineData { machine_id: number; panne_count: number; avg_criticite: number }
interface HeatmapData { zones: Record<string, HeatmapZoneData>; machines: HeatmapMachineData[] }

// ─── Coordinate mapping (DB ↔ % of image) ────────────────────────
const MAP = { minX: 5.2, maxX: 157.2, minY: 4.4, maxY: 111.7 }
const rangeX = MAP.maxX - MAP.minX
const rangeY = MAP.maxY - MAP.minY
const toPctX = (x: number) => ((x - MAP.minX) / rangeX) * 100
const toPctY = (y: number) => ((y - MAP.minY) / rangeY) * 100
const fromPctX = (pct: number) => MAP.minX + (pct / 100) * rangeX
const fromPctY = (pct: number) => MAP.minY + (pct / 100) * rangeY

// ─── Zone definitions ─────────────────────────────────────────────
const ZONE_DEFS: Record<string, { label: string; color: string; border: string }> = {
  'Entree':        { label: 'Réception',   color: '#43a047', border: '#66bb6a' },
  'Pretri':        { label: 'Pré-tri',     color: '#f9a825', border: '#fdd835' },
  'Triage':        { label: 'Triage',      color: '#1e88e5', border: '#42a5f5' },
  'TriageOptique': { label: 'Tri optique', color: '#ff8f00', border: '#ffb300' },
  'Affinage':      { label: 'Affinage',    color: '#00897b', border: '#26a69a' },
  'Compactage':    { label: 'Compactage',  color: '#e53935', border: '#ef5350' },
  'Stockage':      { label: 'Stockage',    color: '#5e35b1', border: '#7e57c2' },
  'Refus':         { label: 'Refus',       color: '#546e7a', border: '#78909c' },
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  convoyeur:   { label: 'Convoyeur',   color: '#f9a825' },
  broyeur:     { label: 'Broyeur',     color: '#e53935' },
  automate:    { label: 'Automate',    color: '#1565c0' },
  deverseur:   { label: 'Déverseur',   color: '#7b1fa2' },
  crible:      { label: 'Crible',      color: '#2e7d32' },
  poste_arret: { label: 'Poste arrêt', color: '#f57f17' },
  equipement:  { label: 'Équipement',  color: '#546e7a' },
}

const STATUT_DOT: Record<string, string> = {
  operationnel: '#22c55e', en_panne: '#ef4444', maintenance: '#f97316', arret: '#6b7280',
}

const STATUT_OPTIONS = [
  { value: 'operationnel', label: 'Opérationnel' },
  { value: 'en_panne',     label: 'En panne' },
  { value: 'maintenance',  label: 'Maintenance' },
  { value: 'arret',        label: 'À l\'arrêt' },
]
const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))
const ZONE_OPTIONS = Object.entries(ZONE_DEFS).map(([k, v]) => ({ value: k, label: v.label }))
const PRESET_COLORS = [
  '#22c55e', '#ef4444', '#f97316', '#6b7280', '#3b82f6', '#8b5cf6',
  '#ec4899', '#f59e0b', '#14b8a6', '#06b6d4', '#f43f5e', '#84cc16',
]

// ─── Label size (em) ──────────────────────────────────────────────
const DEFAULT_LABEL_EM = 0.9
const MOBILE_EM_FACTOR = 0.65  // scale down labels on small screens
// taille_pastille now stores the raw em value (e.g. 0.9 → stored as 0.9)
// Legacy integer values (5,7,9,11,14) are auto-converted: value / 10
/** Resolve the em font-size for a machine label */
function getLabelEm(m: SchemaMachine): number {
  if (!m.taille_pastille) return DEFAULT_LABEL_EM
  const v = m.taille_pastille
  // Legacy: old integer values < 20 were on a 0-14 scale → divide by 10
  if (Number.isInteger(v) && v > 0 && v < 20) return v / 10
  return v
}

/** Truncate a machine name for inline display inside a pastille */
function truncateName(name: string, max = 8): string {
  if (!name) return '?'
  const cvMatch = name.match(/(?:convoyeur\s*)?([A-Z]{1,3}[-]?\d{1,4}[A-Z]?)/i)
  if (cvMatch && cvMatch[1].length <= max) return cvMatch[1]
  if (name.length <= max) return name
  const words = name.split(/[\s_\-]+/).filter(Boolean)
  if (words.length > 1) {
    const acronym = words.map(w => w[0]?.toUpperCase()).join('')
    if (acronym.length >= 2 && acronym.length <= max) return acronym
    return words[0].substring(0, max)
  }
  return name.substring(0, max)
}

// ─── Edit form ─────────────────────────────────────────────────────
interface EditForm {
  nom: string; code_interne: string; zone: string; etage: string
  ligne: string; type: string; statut: string; notes: string
  pos_x: string; pos_y: string; couleur: string; taille_pastille: string; rotation: string
}

const emptyForm = (): EditForm => ({
  nom: '', code_interne: '', zone: '', etage: '0', ligne: '',
  type: 'equipement', statut: 'operationnel', notes: '',
  pos_x: '', pos_y: '', couleur: '', taille_pastille: '', rotation: '0',
})

// ═══════════════════════════════════════════════════════════════════
export default function SchemaInteractif() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isManager = user?.role === 'manager' || user?.role === 'admin'

  // ─── State ────────────────────────────────────────────────────
  const [data, setData] = useState<SchemaData>({ machines: [], zones: [], etages: [], lignes: [] })
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [selectedMachine, setSelectedMachine] = useState<SchemaMachine | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [hiddenZones, setHiddenZones] = useState<Set<string>>(new Set())
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [selectedEtage, setSelectedEtage] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [heatmapMode, setHeatmapMode] = useState(false)
  const [heatmapDays, setHeatmapDays] = useState(30)  // 7, 30, 90, 0 (all)
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null)

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editingMachine, setEditingMachine] = useState<SchemaMachine | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createPos, setCreatePos] = useState({ pctX: 0, pctY: 0 })
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showOverflow, setShowOverflow] = useState(false)  // mobile "..." overflow menu
  const [showLegend, setShowLegend] = useState(false)  // mobile legend (collapsible)
  // Track whether the Layout's bottom nav is collapsed (affects canvas height on mobile)
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('trimaint_nav_collapsed') === '1' } catch { return false }
  })
  useEffect(() => {
    const onStorage = () => {
      try { setNavCollapsed(localStorage.getItem('trimaint_nav_collapsed') === '1') } catch {}
    }
    window.addEventListener('storage', onStorage)
    // Poll every 400ms — localStorage doesn't fire in the same tab
    const interval = setInterval(onStorage, 400)
    return () => { window.removeEventListener('storage', onStorage); clearInterval(interval) }
  }, [])

  // Drag
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [deletingBatch, setDeletingBatch] = useState(false)

  // Smooth zoom transition
  const [smoothTransition, setSmoothTransition] = useState(false)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const lastTouchDist = useRef(0)
  const lastTouchCenter = useRef({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })

  // ─── Heatmap ─────────────────────────────────────────────────
  useEffect(() => {
    if (!heatmapMode) { setHeatmapData(null); return }
    api.get(`/kpi/heatmap?days=${heatmapDays}`).then(r => setHeatmapData(r.data)).catch(() => {})
  }, [heatmapMode, heatmapDays])

  const heatmapMachineMap = useMemo(() => {
    const map = new Map<number, HeatmapMachineData>()
    heatmapData?.machines.forEach(m => map.set(m.machine_id, m))
    return map
  }, [heatmapData])

  const getHeatmapColor = (c: number) => {
    if (c === 0) return 'rgba(34,197,94,0.25)'
    if (c <= 3) return 'rgba(234,179,8,0.35)'
    if (c <= 7) return 'rgba(249,115,22,0.40)'
    return 'rgba(239,68,68,0.50)'
  }
  const getHeatmapTextColor = (c: number) => {
    if (c === 0) return '#86efac'; if (c <= 3) return '#fde047'; if (c <= 7) return '#fdba74'; return '#fca5a5'
  }

  const ZONE_BOUNDS: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
    'Entree': { x1: 0, y1: 0, x2: 18, y2: 30 }, 'Pretri': { x1: 18, y1: 0, x2: 38, y2: 35 },
    'Triage': { x1: 38, y1: 0, x2: 60, y2: 35 }, 'TriageOptique': { x1: 60, y1: 0, x2: 78, y2: 30 },
    'Affinage': { x1: 38, y1: 35, x2: 60, y2: 70 }, 'Compactage': { x1: 60, y1: 30, x2: 82, y2: 65 },
    'Stockage': { x1: 78, y1: 30, x2: 100, y2: 70 }, 'Refus': { x1: 0, y1: 70, x2: 38, y2: 100 },
  }

  // ─── Detect mobile ───────────────────────────────────────────
  // Threshold synced with Layout.tsx (1024px) so landscape phones also
  // get the mobile-optimised schema UI.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ─── Fetch data ──────────────────────────────────────────────
  const fetchData = useCallback(() => {
    const params = new URLSearchParams()
    if (selectedEtage !== null) params.set('etage', String(selectedEtage))
    api.get(`/machines/schema-data${params ? '?' + params : ''}`).then(r => {
      setData(r.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [selectedEtage])
  useEffect(() => { setLoading(true); fetchData() }, [fetchData])

  // ─── Filtered machines ───────────────────────────────────────
  const filteredMachines = useMemo(() => {
    let items = data.machines
    if (hiddenZones.size > 0) items = items.filter(m => !hiddenZones.has(m.zone || ''))
    if (hiddenTypes.size > 0) items = items.filter(m => !hiddenTypes.has(m.type))
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter(m => (m.nom || '').toLowerCase().includes(q) || (m.code_interne || '').toLowerCase().includes(q))
    }
    return items
  }, [data.machines, hiddenZones, hiddenTypes, searchQuery])
  const visibleIds = useMemo(() => new Set(filteredMachines.map(m => m.id)), [filteredMachines])

  // ─── Image load ─────────────────────────────────────────────
  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const naturalW = e.currentTarget.naturalWidth
    const naturalH = e.currentTarget.naturalHeight
    setImgNatural({ w: naturalW, h: naturalH })
    setImgLoaded(true)
    // Compute the initial fit-to-viewport zoom now that we know the natural size.
    // Image is rendered at natural width (e.g. 3307px); we scale down to fit.
    if (containerRef.current && naturalW > 0) {
      const rect = containerRef.current.getBoundingClientRect()
      const fitZoom = Math.max(0.1, Math.min(2, rect.width / naturalW))
      setZoom(fitZoom)
    }
  }, [])

  // ═══════════════════════════════════════════════════════════
  //  ZOOM — centered on cursor, smooth transition
  // ═══════════════════════════════════════════════════════════
  const zoomTo = useCallback((newZoom: number, cx?: number, cy?: number) => {
    const clamped = Math.max(0.3, Math.min(8, newZoom))
    if (cx !== undefined && cy !== undefined && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const mx = cx - rect.left
      const my = cy - rect.top
      const scale = clamped / zoom
      setPan({ x: mx - (mx - pan.x) * scale, y: my - (my - pan.y) * scale })
    }
    setZoom(clamped)
  }, [zoom, pan])

  // Button zoom — centers on visible area center
  const zoomIn = useCallback(() => {
    setSmoothTransition(true)
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      zoomTo(zoom * 1.3, rect.left + rect.width / 2, rect.top + rect.height / 2)
    } else { setZoom(z => Math.min(8, z * 1.3)) }
    setTimeout(() => setSmoothTransition(false), 250)
  }, [zoom, zoomTo])

  const zoomOut = useCallback(() => {
    setSmoothTransition(true)
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      zoomTo(zoom / 1.3, rect.left + rect.width / 2, rect.top + rect.height / 2)
    } else { setZoom(z => Math.max(0.3, z / 1.3)) }
    setTimeout(() => setSmoothTransition(false), 250)
  }, [zoom, zoomTo])

  const fitAll = useCallback(() => {
    setSmoothTransition(true)
    // Compute the zoom that fits the image (native width) into the current viewport.
    // Previously the image was rendered at 100vw and zoom=1 meant "fit" — now the
    // image is rendered at its natural width, so we must scale down to fit.
    if (imgNatural.w > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const fitZoom = Math.max(0.1, Math.min(2, rect.width / imgNatural.w))
      setZoom(fitZoom)
    } else {
      setZoom(1)
    }
    setPan({ x: 0, y: 0 })
    setTimeout(() => setSmoothTransition(false), 350)
  }, [imgNatural.w])

  // ─── Zoom to a specific machine ──────────────────────────────
  // Centers the machine in the viewport and zooms to ~3x so the user can
  // immediately locate it without panning manually.
  const zoomToMachine = useCallback((machineId: number, targetZoom?: number) => {
    const m = data.machines.find(x => x.id === machineId)
    if (!m || !m.pos_x || !m.pos_y || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    // The pastille left% = toPctX(pos_x), so pos_x in DB maps to a % of the image.
    // The image is rendered at imgNatural.w/h wide, so we convert to image pixels:
    const leftPct = toPctX(m.pos_x)   // 0..100
    const topPct = toPctY(m.pos_y)    // 0..100
    const machineXpx = (leftPct / 100) * imgNatural.w
    const machineYpx = (topPct / 100) * imgNatural.h

    // Target zoom: aim for ~3x so the label and its surroundings are clearly visible.
    // Don't shrink below current zoom (so re-searching a far machine always zooms in).
    const newZoom = targetZoom ?? Math.max(3, zoom)

    // The container applies transform: translate(pan.x, pan.y) scale(zoom).
    // We want machineXpx (in image space) to map to the container's horizontal center.
    // container_center_x = pan.x + machineXpx * newZoom
    // => pan.x = container_center_x - machineXpx * newZoom
    const panX = rect.width / 2 - machineXpx * newZoom
    const panY = rect.height / 2 - machineYpx * newZoom

    setSmoothTransition(true)
    setZoom(newZoom)
    setPan({ x: panX, y: panY })
    setTimeout(() => setSmoothTransition(false), 500)
  }, [data.machines, imgNatural.w, imgNatural.h, zoom])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setSmoothTransition(false)
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    zoomTo(zoom * factor, e.clientX, e.clientY)
  }, [zoom, zoomTo])

  // ─── Touch: pinch-to-zoom + pan ─────────────────────────────
  const getTouchDist = (t: React.TouchList) => {
    if (t.length < 2) return 0
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }
  const getTouchCenter = (t: React.TouchList) => ({
    x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2,
  })

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (editMode && draggingId !== null) return
    if (e.touches.length === 2) {
      lastTouchDist.current = getTouchDist(e.touches)
      lastTouchCenter.current = getTouchCenter(e.touches)
    } else if (e.touches.length === 1) {
      isPanning.current = true
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, px: pan.x, py: pan.y }
    }
  }, [pan, editMode, draggingId])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    if (editMode && draggingId !== null) return
    if (e.touches.length === 2) {
      const dist = getTouchDist(e.touches), center = getTouchCenter(e.touches)
      if (lastTouchDist.current > 0) {
        const newZ = Math.max(0.3, Math.min(8, zoom * (dist / lastTouchDist.current)))
        zoomTo(newZ, center.x, center.y)
      }
      lastTouchDist.current = dist; lastTouchCenter.current = center
    } else if (e.touches.length === 1 && isPanning.current) {
      setPan({ x: dragStart.current.px + e.touches[0].clientX - dragStart.current.x, y: dragStart.current.py + e.touches[0].clientY - dragStart.current.y })
    }
  }, [zoom, editMode, draggingId, zoomTo])

  const handleTouchEnd = useCallback(() => { isPanning.current = false; lastTouchDist.current = 0 }, [])

  // ─── Mouse pan ──────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (editMode && draggingId !== null) return
    if ((e.target as Element).closest('[data-hotspot]')) return
    isPanning.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }, [pan, editMode, draggingId])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (editMode && draggingId !== null) {
      const imgEl = containerRef.current?.querySelector('img')
      if (!imgEl) return
      const rect = imgEl.getBoundingClientRect()
      const pctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
      const pctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
      setData(prev => ({
        ...prev,
        machines: prev.machines.map(m =>
          m.id === draggingId
            ? { ...m, pos_x: parseFloat(fromPctX(pctX).toFixed(1)), pos_y: parseFloat(fromPctY(pctY).toFixed(1)) }
            : m
        )
      }))
      return
    }
    if (!isPanning.current) return
    setPan({ x: dragStart.current.px + e.clientX - dragStart.current.x, y: dragStart.current.py + e.clientY - dragStart.current.y })
  }, [editMode, draggingId])

  const handleMouseUp = useCallback(() => {
    if (editMode && draggingId !== null) {
      const m = data.machines.find(m => m.id === draggingId)
      if (m?.pos_x && m?.pos_y) savePosition(draggingId, m.pos_x, m.pos_y)
      setDraggingId(null)
    }
    isPanning.current = false
  }, [editMode, draggingId, data.machines])

  // ─── Double-click to add hotspot (edit mode) ────────────────
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!editMode) return
    if ((e.target as Element).closest('[data-hotspot]')) return
    const imgEl = containerRef.current?.querySelector('img')
    if (!imgEl) return
    const rect = imgEl.getBoundingClientRect()
    const pctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const pctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setCreatePos({ pctX, pctY })
    setEditForm({
      ...emptyForm(),
      pos_x: fromPctX(pctX).toFixed(1),
      pos_y: fromPctY(pctY).toFixed(1),
    })
    setShowCreateModal(true)
  }, [editMode])

  // ─── Hotspot drag start ─────────────────────────────────────
  const handleHotspotMouseDown = useCallback((e: React.MouseEvent, m: SchemaMachine) => {
    if (!editMode) return
    e.stopPropagation(); e.preventDefault()
    setDraggingId(m.id); setSelectedMachine(m)
  }, [editMode])

  const handleHotspotTouchStart = useCallback((e: React.TouchEvent, m: SchemaMachine) => {
    if (!editMode || e.touches.length !== 1) return
    e.stopPropagation(); setDraggingId(m.id); setSelectedMachine(m)
  }, [editMode])

  const handleHotspotTouchMove = useCallback((e: React.TouchEvent) => {
    if (draggingId === null) return
    e.preventDefault(); e.stopPropagation()
    const imgEl = containerRef.current?.querySelector('img')
    if (!imgEl || e.touches.length !== 1) return
    const rect = imgEl.getBoundingClientRect()
    const pctX = Math.max(0, Math.min(100, ((e.touches[0].clientX - rect.left) / rect.width) * 100))
    const pctY = Math.max(0, Math.min(100, ((e.touches[0].clientY - rect.top) / rect.height) * 100))
    setData(prev => ({
      ...prev,
      machines: prev.machines.map(m =>
        m.id === draggingId ? { ...m, pos_x: parseFloat(fromPctX(pctX).toFixed(1)), pos_y: parseFloat(fromPctY(pctY).toFixed(1)) } : m
      )
    }))
  }, [draggingId])

  const handleHotspotTouchEnd = useCallback(() => {
    if (draggingId !== null) {
      const m = data.machines.find(m => m.id === draggingId)
      if (m?.pos_x && m?.pos_y) savePosition(draggingId, m.pos_x, m.pos_y)
      setDraggingId(null)
    }
  }, [draggingId, data.machines])

  // ─── Save position ──────────────────────────────────────────
  const savePosition = useCallback(async (id: number, px: number, py: number) => {
    try { await api.put(`/machines/${id}`, { pos_x: px, pos_y: py }); toast.success('Position mise à jour', { duration: 2000, icon: '📍' }) }
    catch { toast.error('Erreur sauvegarde position') }
  }, [])

  // ─── Rotation: persisted on the backend (machines.rotation column) ───
  // No more localStorage — rotation now follows the machine across all browsers/devices.

  // ─── Open edit modal ────────────────────────────────────────
  const openEditModal = useCallback((m: SchemaMachine) => {
    setEditingMachine(m)
    setEditForm({
      nom: m.nom || '', code_interne: m.code_interne || '', zone: m.zone || '',
      etage: String(m.etage ?? 0), ligne: m.ligne || '', type: m.type || 'equipement',
      statut: m.statut || 'operationnel', notes: '',
      pos_x: m.pos_x ? String(m.pos_x) : '', pos_y: m.pos_y ? String(m.pos_y) : '',
      couleur: m.couleur || '',
      taille_pastille: m.taille_pastille
        ? String(Number.isInteger(m.taille_pastille) && m.taille_pastille > 0 && m.taille_pastille < 20 ? m.taille_pastille / 10 : m.taille_pastille)
        : '',
      rotation: String(m.rotation ?? 0),
    })
    setShowEditModal(true)
  }, [])

  // ─── Save edit form ─────────────────────────────────────────
  const handleSaveEdit = useCallback(async () => {
    if (!editingMachine) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        nom: editForm.nom, code_interne: editForm.code_interne || null,
        zone: editForm.zone || null, etage: parseInt(editForm.etage) || 0,
        ligne: editForm.ligne || null, type: editForm.type, statut: editForm.statut,
        pos_x: editForm.pos_x ? parseFloat(editForm.pos_x) : null,
        pos_y: editForm.pos_y ? parseFloat(editForm.pos_y) : null,
        couleur: editForm.couleur || null,
        taille_pastille: editForm.taille_pastille ? parseFloat(editForm.taille_pastille) : null,
        rotation: parseFloat(editForm.rotation) || 0,
      }
      if (editForm.notes.trim()) payload.notes = editForm.notes
      await api.put(`/machines/${editingMachine.id}`, payload)
      toast.success(`${editForm.code_interne || editForm.nom} mis à jour`, { duration: 3000 })
      setShowEditModal(false); setEditingMachine(null); fetchData()
    } catch { toast.error('Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }, [editingMachine, editForm, fetchData])

  // ─── Create new machine ─────────────────────────────────────
  const handleCreateMachine = useCallback(async () => {
    if (!editForm.nom.trim()) return
    // Proactive check: code_interne must be unique
    if (editForm.code_interne.trim()) {
      const code = editForm.code_interne.trim().toUpperCase()
      const exists = data.machines.some(
        m => (m.code_interne || '').toUpperCase() === code
      )
      if (exists) {
        toast.error(`Code interne "${code}" déjà utilisé par un autre équipement`, { duration: 4000 })
        return
      }
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        nom: editForm.nom, code_interne: editForm.code_interne || null,
        zone: editForm.zone || null, etage: parseInt(editForm.etage) || 0,
        ligne: editForm.ligne || null, statut: editForm.statut,
        pos_x: editForm.pos_x ? parseFloat(editForm.pos_x) : null,
        pos_y: editForm.pos_y ? parseFloat(editForm.pos_y) : null,
        couleur: editForm.couleur || null,
        taille_pastille: editForm.taille_pastille ? parseFloat(editForm.taille_pastille) : null,
        rotation: parseFloat(editForm.rotation) || 0,
      }
      await api.post('/machines/', payload)
      toast.success(`${editForm.nom} créé`, { duration: 3000 })
      setShowCreateModal(false)
      setEditForm(emptyForm())
      fetchData()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || ''
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('code_interne'))
        toast.error(`Code interne "${editForm.code_interne}" déjà utilisé`, { duration: 4000 })
      else
        toast.error(msg || 'Erreur lors de la création')
    }
    finally { setSaving(false) }
  }, [editForm, fetchData])

  // ─── Delete machine ─────────────────────────────────────────
  const handleDeleteMachine = useCallback(async (id: number, nom: string) => {
    setDeletingId(id)
    try {
      await api.delete(`/machines/${id}`)
      toast.success(`${nom} supprimé`, { duration: 3000 })
      setSelectedMachine(null); setShowEditModal(false)
      setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      fetchData()
    } catch { toast.error('Erreur lors de la suppression') }
    finally { setDeletingId(null) }
  }, [fetchData])

  // ─── Multi-select toggle ────────────────────────────────────
  const toggleSelectId = useCallback((id: number) => {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }, [])

  // ─── Batch delete selected ───────────────────────────────────
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    if (!confirm(`Supprimer ${count} équipement${count > 1 ? 's' : ''} ?`)) return
    setDeletingBatch(true)
    let ok = 0, fail = 0
    for (const id of selectedIds) {
      try { await api.delete(`/machines/${id}`); ok++ } catch { fail++ }
    }
    setDeletingBatch(false)
    setSelectedIds(new Set()); setSelectedMachine(null); fetchData()
    toast.success(`${ok} supprimé${ok > 1 ? 's' : ''}${fail ? `, ${fail} erreur${fail > 1 ? 's' : ''}` : ''}`, { duration: 3000 })
  }, [selectedIds, fetchData])

  // ─── Toggle edit mode (resets multi-select) ─────────────────
  const toggleEditMode = useCallback(() => {
    const next = !editMode
    setEditMode(next)
    if (!next) { setMultiSelectMode(false); setSelectedIds(new Set()); setDraggingId(null) }
  }, [editMode])

  // ─── Toggle helpers ─────────────────────────────────────────
  const toggleZone = useCallback((z: string) => setHiddenZones(p => { const s = new Set(p); s.has(z) ? s.delete(z) : s.add(z); return s }), [])
  const toggleType = useCallback((t: string) => setHiddenTypes(p => { const s = new Set(p); s.has(t) ? s.delete(t) : s.add(t); return s }), [])
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); setHiddenZones(new Set()); setHiddenTypes(new Set()); setSearchQuery(''); setSelectedEtage(null) }, [])
  const goToMachine = useCallback((m: SchemaMachine) => navigate(`/machines/${m.id}`), [navigate])

  // Counts
  const zoneCounts = useMemo(() => { const c: Record<string, number> = {}; data.machines.forEach(m => { const z = m.zone || 'Autre'; c[z] = (c[z] || 0) + 1 }); return c }, [data.machines])
  const typeCounts = useMemo(() => { const c: Record<string, number> = {}; data.machines.forEach(m => { c[m.type] = (c[m.type] || 0) + 1 }); return c }, [data.machines])

  const searchMatch = useMemo(() => {
    if (!searchQuery) return null
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    // 1) Exact match (case-insensitive) on code_interne or nom
    const exact = data.machines.find(m =>
      (m.code_interne || '').toLowerCase() === q || (m.nom || '').toLowerCase() === q
    )
    if (exact) return exact
    // 2) "Starts with" match (e.g. "L31" matches "L310", "L311", "L315")
    const startsWith = data.machines.find(m =>
      (m.code_interne || '').toLowerCase().startsWith(q) || (m.nom || '').toLowerCase().startsWith(q)
    )
    if (startsWith) return startsWith
    // 3) Contains match (last resort)
    return data.machines.find(m =>
      (m.code_interne || '').toLowerCase().includes(q) || (m.nom || '').toLowerCase().includes(q)
    ) || null
  }, [searchQuery, data.machines])

  // Helper: resolve a machine's display color
  const getColor = (m: SchemaMachine) => m.couleur || STATUT_DOT[m.statut] || '#6b7280'

  // ─── Loading ────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4" />
        <p className="text-lg">Chargement du schéma de process...</p>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className={`flex flex-col bg-gray-900 overflow-hidden ${
      isMobile
        ? navCollapsed
          ? 'h-[calc(100dvh-3.5rem)]'      // header only — bottom nav hidden
          : 'h-[calc(100dvh-3.5rem-4rem)]' // header + bottom nav
        : 'h-dvh'
    }`}>

      {/* ─── Top Bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 shrink-0 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-300 shrink-0">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-white font-semibold text-base truncate">
            {isMobile ? 'Schéma Process' : 'Schéma de Process — Trisélec'}
          </h1>
          {!isMobile && <span className="text-gray-500 text-xs shrink-0 hidden sm:inline">{filteredMachines.length}/{data.machines.length}</span>}
          {editMode && (
            <span className="text-amber-400 text-[10px] font-bold uppercase tracking-wider bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/30">
              Mode Édition
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isManager && (
            <button onClick={toggleEditMode}
              className={`p-2 rounded-lg hover:bg-gray-700 transition-colors ${editMode ? 'text-amber-400 bg-amber-400/10' : 'text-gray-300'}`}
              title={editMode ? 'Quitter le mode édition' : 'Mode édition'}>
              {editMode ? <Save size={18} /> : <Pencil size={18} />}
            </button>
          )}
          {editMode && !isMobile && (
            <button onClick={() => { setMultiSelectMode(!multiSelectMode); if (multiSelectMode) setSelectedIds(new Set()) }}
              className={`p-2 rounded-lg hover:bg-gray-700 transition-colors ${multiSelectMode ? 'text-blue-400 bg-blue-400/10' : 'text-gray-300'}`}
              title={multiSelectMode ? 'Quitter la sélection multiple' : 'Sélection multiple'}>
              {multiSelectMode ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
          )}
          <button onClick={() => setShowSearch(!showSearch)} className={`p-2 rounded-lg hover:bg-gray-700 ${showSearch ? 'text-blue-400 bg-blue-400/10' : 'text-gray-300'}`}>
            <Search size={18} />
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className={`p-2 rounded-lg hover:bg-gray-700 ${showFilters ? 'text-blue-400 bg-blue-400/10' : 'text-gray-300'}`}>
            <Filter size={18} />
          </button>
          {!isMobile && (
            <div className="flex items-center gap-1">
              <button onClick={() => setHeatmapMode(!heatmapMode)} className={`p-2 rounded-lg hover:bg-gray-700 ${heatmapMode ? 'text-red-400 bg-red-400/10' : 'text-gray-300'}`} title="Heatmap pannes">
                <Thermometer size={18} />
              </button>
              {heatmapMode && (
                <select
                  value={heatmapDays}
                  onChange={e => setHeatmapDays(Number(e.target.value))}
                  className="text-[10px] bg-gray-700 border border-gray-600 rounded-lg px-1.5 py-1 text-gray-300 focus:outline-none focus:border-red-500"
                  title="Période heatmap"
                >
                  <option value={7}>7j</option>
                  <option value={30}>30j</option>
                  <option value={90}>90j</option>
                  <option value={0}>Tout</option>
                </select>
              )}
            </div>
          )}
          <button onClick={zoomOut} className="p-2 rounded-lg hover:bg-gray-700 text-gray-300"><ZoomOut size={18} /></button>
          {!isMobile && <span className="text-gray-500 text-[10px] w-10 text-center hidden sm:inline">{Math.round(zoom * 100)}%</span>}
          <button onClick={zoomIn} className="p-2 rounded-lg hover:bg-gray-700 text-gray-300"><ZoomIn size={18} /></button>
          {!isMobile && (
            <button onClick={fitAll} className="p-2 rounded-lg hover:bg-gray-700 text-gray-300"><Maximize2 size={18} /></button>
          )}
          {isMobile && (
            <button onClick={() => setShowOverflow(true)} className="p-2 rounded-lg hover:bg-gray-700 text-gray-300" aria-label="Plus d'actions">
              <MoreHorizontal size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ─── Edit mode hint bar ──────────────────────────────── */}
      {editMode && (
        <div className="px-3 py-1.5 bg-amber-900/30 border-b border-amber-700/30 shrink-0 z-20 flex items-center gap-2 text-amber-300 text-xs">
          <Plus size={14} className="shrink-0" />
          <span className="hidden sm:inline">{multiSelectMode ? 'Cliquez sur les pastilles à supprimer. Barre d\'action en bas.' : 'Double-cliquez pour ajouter. Glissez pour déplacer. Cliquez pour modifier.'}</span>
          <span className="sm:hidden">{multiSelectMode ? 'Cliquez pour sélectionner.' : 'Double-clic: ajouter. Glisser: déplacer.'}</span>
        </div>
      )}

      {/* ─── Search bar ───────────────────────────────────────── */}
      {showSearch && (
        <div className={`px-3 py-2 bg-gray-800 border-b border-gray-700 shrink-0 z-30 ${isMobile ? 'sticky top-0 shadow-lg' : ''}`}>
          <div className="relative flex items-center">
            <Search size={isMobile ? 20 : 16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchMatch) {
                  e.preventDefault()
                  zoomToMachine(searchMatch.id)
                }
              }}
              placeholder="Rechercher (code, nom)... — Entrée pour localiser"
              className={`w-full ${isMobile ? 'pl-11 pr-20 py-2.5 text-base' : 'pl-10 pr-20 py-2 text-sm'} bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500`} autoFocus />
            {/* Locate button (zoom to match) — appears when there's a match */}
            {searchMatch && (
              <button
                onClick={() => zoomToMachine(searchMatch.id)}
                className="absolute right-11 top-1/2 -translate-y-1/2 p-1 rounded-md bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors"
                title="Localiser sur le schéma (zoom)"
                aria-label="Localiser sur le schéma"
              >
                <Crosshair size={isMobile ? 18 : 14} />
              </button>
            )}
            {searchQuery ? (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"><X size={isMobile ? 20 : 16} /></button>
            ) : (
              <button onClick={() => setShowSearch(false)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1" aria-label="Fermer la recherche"><X size={isMobile ? 18 : 14} /></button>
            )}
          </div>
          {/* Hint line */}
          {searchMatch ? (
            <p className="text-yellow-400 text-[10px] mt-1.5 px-1 flex items-center gap-1">
              <Crosshair size={10} /> « {searchMatch.code_interne || searchMatch.nom} » trouvé —
              appuyez sur <kbd className="px-1 py-0.5 bg-gray-700 rounded text-[9px] font-mono">Entrée</kbd>
              ou cliquez la cible pour zoomer
            </p>
          ) : searchQuery ? (
            <p className="text-gray-500 text-[10px] mt-1.5 px-1">Aucune correspondance exacte — tapez le code exact (ex: L315)</p>
          ) : null}
        </div>
      )}

      {/* ─── Filter panel ─────────────────────────────────────── */}
      {showFilters && (
        <div className={`${isMobile ? '' : 'absolute left-0 top-[52px] z-20'} bg-gray-800 border-b border-gray-700 ${isMobile ? 'shrink-0' : 'w-60 rounded-br-lg shadow-xl'}`}>
          <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
            <div>
              <h3 className="text-gray-400 text-[10px] font-bold uppercase mb-1.5 flex items-center gap-1"><Layers size={12} /> Étage</h3>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setSelectedEtage(null)} className={`px-2.5 py-1 rounded-md text-xs ${selectedEtage === null ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Tous</button>
                {[0, 1, 2].map(e => (<button key={e} onClick={() => setSelectedEtage(e)} className={`px-2.5 py-1 rounded-md text-xs ${selectedEtage === e ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>E{e}</button>))}
              </div>
            </div>
            <div>
              <h3 className="text-gray-400 text-[10px] font-bold uppercase mb-1.5 flex items-center gap-1"><MapPin size={12} /> Zones</h3>
              <div className="flex flex-wrap gap-1">
                {Object.entries(ZONE_DEFS).map(([key, def]) => (
                  <button key={key} onClick={() => toggleZone(key)}
                    className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 border ${hiddenZones.has(key) ? 'border-gray-600 text-gray-500 line-through opacity-40' : 'text-gray-200'}`}
                    style={hiddenZones.has(key) ? {} : { borderColor: def.border, background: def.color + '22' }}>
                    <span className="w-2 h-2 rounded-sm" style={{ background: def.color }} />
                    {isMobile ? def.label.split(' ')[0] : def.label}
                    <span className="text-gray-500">({zoneCounts[key] || 0})</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-gray-400 text-[10px] font-bold uppercase mb-1.5 flex items-center gap-1"><Layers size={12} /> Types</h3>
              <div className="flex flex-wrap gap-1">
                {Object.entries(TYPE_CONFIG).map(([key, tc]) => (
                  <button key={key} onClick={() => toggleType(key)}
                    className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 border ${hiddenTypes.has(key) ? 'border-gray-600 text-gray-500 line-through opacity-40' : 'text-gray-200 border-gray-600'}`}>
                    <span className="w-2 h-2 rounded-sm" style={{ background: tc.color }} />
                    {tc.label}
                    <span className="text-gray-500">({typeCounts[key] || 0})</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={resetView} className="w-full py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs">Réinitialiser</button>
          </div>
        </div>
      )}

      {/* ─── Main canvas ──────────────────────────────────────── */}
      <div ref={containerRef}
        className={`flex-1 relative overflow-hidden bg-gray-950 touch-none select-none ${editMode ? 'cursor-crosshair' : ''}`}
        onWheel={handleWheel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <div className="absolute origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            willChange: 'transform',
            transition: smoothTransition ? 'transform 0.2s ease-out' : 'none',
          }}>
          <img src="/process2.jpg" alt="Schéma de process Trisélec" className="block max-w-none"
            style={{
              // Use the image's natural width — never downsample to viewport width
              // (downsampling then scaling up caused the blur at zoom > 100%).
              // The browser keeps the full source pixels available for crisp zoom.
              width: imgLoaded && imgNatural.w ? `${imgNatural.w}px` : undefined,
              height: 'auto',
              imageRendering: 'auto',  // smooth but uses full source resolution
              // Disable browser downscaling on hidpi screens
              backfaceVisibility: 'hidden',
            }}
            onLoad={handleImgLoad}
            draggable={false} />

          {imgLoaded && (
            <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
              {/* Heatmap overlays */}
              {heatmapMode && heatmapData && Object.entries(heatmapData.zones).map(([zoneKey, zoneData]) => {
                const bounds = ZONE_BOUNDS[zoneKey]; if (!bounds) return null
                const count = zoneData.open_pannes + zoneData.recent_pannes
                return (
                  <div key={zoneKey} className="absolute flex items-center justify-center"
                    style={{ left: `${bounds.x1}%`, top: `${bounds.y1}%`, width: `${bounds.x2 - bounds.x1}%`, height: `${bounds.y2 - bounds.y1}%`, background: getHeatmapColor(count), borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="font-bold text-lg drop-shadow-lg" style={{ color: getHeatmapTextColor(count), textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>{count}</span>
                  </div>
                )
              })}

              {/* Machine labels (text-only, em-sized, zoom-adaptive) */}
              {data.machines.map(m => {
                if (!m.pos_x || !m.pos_y || !visibleIds.has(m.id)) return null
                const left = toPctX(m.pos_x), top = toPctY(m.pos_y)
                const isHovered = hoveredId === m.id, isSearch = searchMatch?.id === m.id, isDrag = draggingId === m.id
                const tc = TYPE_CONFIG[m.type], sc = getColor(m)
                const isSelected = selectedIds.has(m.id)
                const labelEm = getLabelEm(m) * (isMobile ? MOBILE_EM_FACTOR : 1)
                const hoveredEm = labelEm * 1.2
                const rotation = m.rotation ?? 0

                // Build text-shadow stack for readability / highlights
                const baseShadow = '0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.5)'
                const searchShadow = `0 0 6px rgba(250,204,21,0.9), 0 0 14px rgba(250,204,21,0.5), 0 0 3px rgba(0,0,0,0.9)`
                const editShadow = '0 0 4px rgba(251,191,36,0.5), 0 0 3px rgba(0,0,0,0.9)'
                const selectShadow = '0 0 6px rgba(96,165,250,0.8), 0 0 3px rgba(0,0,0,0.9)'
                const dragShadow = '0 0 10px rgba(251,191,36,0.7), 0 0 3px rgba(0,0,0,0.9)'
                const heatmapShadow = heatmapMachineMap.get(m.id)?.panne_count
                  ? '0 0 8px rgba(239,68,68,0.8), 0 0 3px rgba(0,0,0,0.9)' : ''
                const textShadow = isDrag ? dragShadow
                  : isSearch ? searchShadow
                  : isSelected ? selectShadow
                  : heatmapShadow || (editMode && !isDrag ? editShadow : baseShadow)

                return (
                  <div key={m.id} data-hotspot="true" className="absolute group"
                    style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'auto',
                      cursor: multiSelectMode ? 'pointer' : editMode ? 'grab' : 'pointer', zIndex: isDrag ? 100 : isSelected ? 50 : 10 }}
                    onMouseDown={(e) => {
                      if (multiSelectMode) { e.stopPropagation(); toggleSelectId(m.id); return }
                      if (editMode) { handleHotspotMouseDown(e, m); return }
                      e.stopPropagation(); setSelectedMachine(m)
                    }}
                    onMouseEnter={() => setHoveredId(m.id)} onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => {
                      if (multiSelectMode) { e.stopPropagation(); toggleSelectId(m.id); return }
                      if (!editMode) { e.stopPropagation(); setSelectedMachine(m) }
                    }}
                    onTouchStart={(e) => handleHotspotTouchStart(e, m)}
                    onTouchMove={(e) => handleHotspotTouchMove(e)}
                    onTouchEnd={handleHotspotTouchEnd}
                  >
                    {/* Search highlight: strong pulsing ring + halo + zone delimited */}
                    {isSearch && (
                      <>
                        {/* Large pulsing zone (delimited circle) */}
                        <span
                          className="absolute rounded-full pointer-events-none"
                          style={{
                            left: '50%', top: '50%',
                            width: '90px', height: '90px',
                            transform: 'translate(-50%, -50%)',
                            border: '3px solid rgba(250, 204, 21, 0.9)',
                            boxShadow: '0 0 24px 8px rgba(250, 204, 21, 0.6), inset 0 0 16px 4px rgba(250, 204, 21, 0.3)',
                            animation: 'trimaint-search-pulse 1.2s ease-in-out infinite',
                          }}
                        />
                        {/* Inner pulsing disc behind the label */}
                        <span
                          className="absolute rounded-full pointer-events-none"
                          style={{
                            left: '50%', top: '50%',
                            width: '60px', height: '40px',
                            transform: 'translate(-50%, -50%)',
                            background: 'rgba(250, 204, 21, 0.25)',
                            animation: 'trimaint-search-glow 1.2s ease-in-out infinite',
                          }}
                        />
                      </>
                    )}

                    {/* Selection checkmark badge */}
                    {isSelected && (
                      <span className="absolute -right-1.5 -top-1.5 w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center"
                        style={{ boxShadow: '0 0 6px rgba(96,165,250,0.6)' }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                    )}

                    {/* The label itself — colored text, em-sized, rotatable */}
                    <span
                      className="font-bold whitespace-nowrap transition-all duration-150 select-none"
                      style={{
                        display: 'inline-block',  // REQUIRED: CSS transform: rotate() is ignored on inline elements
                        fontSize: isHovered || isDrag ? `${hoveredEm}em` : `${labelEm}em`,
                        color: isDrag ? '#fbbf24' : isHovered ? '#60a5fa' : sc,
                        textShadow,
                        letterSpacing: '0.02em',
                        transform: `rotate(${rotation}deg)`,
                        transformOrigin: 'center center',
                      }}>
                      {truncateName(m.code_interne || m.nom)}
                    </span>

                    {/* Desktop tooltip on hover */}
                    {!isMobile && isHovered && !editMode && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900/95 border border-gray-600 rounded-lg px-3 py-2 whitespace-nowrap z-50 shadow-xl pointer-events-none">
                        <div className="text-white font-bold text-sm">{m.code_interne || m.nom}</div>
                        <div className="text-gray-400 text-xs">{tc?.label || m.type} · {m.zone}</div>
                        <div className="text-xs mt-0.5" style={{ color: sc }}>{m.statut}</div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/95" />
                      </div>
                    )}
                    {!isMobile && isHovered && editMode && !isDrag && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-amber-900/95 border border-amber-600 rounded-lg px-3 py-2 whitespace-nowrap z-50 shadow-xl pointer-events-none">
                        <div className="text-amber-100 font-bold text-sm">{m.code_interne || m.nom}</div>
                        <div className="text-amber-300/70 text-xs">Glisser · Clic: modifier · Supprimer</div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-amber-900/95" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="absolute bottom-3 left-3 bg-gray-800/80 rounded-lg px-2 py-1 text-gray-400 text-xs backdrop-blur-sm">{Math.round(zoom * 100)}%</div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MOBILE OVERFLOW MENU ("..." button)
         ═══════════════════════════════════════════════════════ */}
      {isMobile && showOverflow && (
        <div className="fixed inset-0 z-50" onClick={() => setShowOverflow(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute bottom-0 left-0 right-0 bg-gray-800 rounded-t-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-800 pt-3 pb-2 px-4 border-b border-gray-700">
              <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-base">Actions</h2>
                <button onClick={() => setShowOverflow(false)} className="text-gray-400 hover:text-white p-1"><X size={20} /></button>
              </div>
            </div>
            <div className="p-3 space-y-1">
              {/* Multi-select (edit mode only) */}
              {editMode && (
                <button onClick={() => { setMultiSelectMode(!multiSelectMode); if (multiSelectMode) setSelectedIds(new Set()); setShowOverflow(false) }}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium min-h-[52px] transition-colors ${multiSelectMode ? 'bg-blue-500/15 text-blue-400' : 'text-gray-300 hover:bg-gray-700/60'}`}>
                  {multiSelectMode ? <CheckSquare size={20} /> : <Square size={20} />}
                  <span className="flex-1 text-left">{multiSelectMode ? 'Quitter la sélection multiple' : 'Sélection multiple'}</span>
                  <ChevronRight size={16} className="text-gray-500" />
                </button>
              )}
              {/* Heatmap */}
              <button onClick={() => { setHeatmapMode(!heatmapMode); setShowOverflow(false) }}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium min-h-[52px] transition-colors ${heatmapMode ? 'bg-red-500/15 text-red-400' : 'text-gray-300 hover:bg-gray-700/60'}`}>
                <Thermometer size={20} />
                <span className="flex-1 text-left">Heatmap pannes</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${heatmapMode ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-500'}`}>
                  {heatmapMode ? 'ACTIF' : 'OFF'}
                </span>
              </button>
              {/* Heatmap period selector */}
              {heatmapMode && (
                <div className="flex items-center gap-1 px-4 py-2">
                  <span className="text-[10px] text-gray-500 mr-1">Période:</span>
                  {[
                    { v: 7, l: '7j' },
                    { v: 30, l: '30j' },
                    { v: 90, l: '90j' },
                    { v: 0, l: 'Tout' },
                  ].map(opt => (
                    <button key={opt.v} onClick={() => setHeatmapDays(opt.v)}
                      className={`px-2 py-1 rounded text-[10px] transition-colors ${heatmapDays === opt.v ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              )}
              {/* Fit all */}
              <button onClick={() => { fitAll(); setShowOverflow(false) }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium min-h-[52px] text-gray-300 hover:bg-gray-700/60 transition-colors">
                <Maximize2 size={20} />
                <span className="flex-1 text-left">Recadrer (fit all)</span>
                <ChevronRight size={16} className="text-gray-500" />
              </button>
              {/* Zoom indicator + reset */}
              <div className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium min-h-[52px] text-gray-300 bg-gray-700/30">
                <ZoomIn size={20} />
                <span className="flex-1 text-left">Zoom actuel</span>
                <span className="text-white font-mono">{Math.round(zoom * 100)}%</span>
                {zoom !== 1 && (
                  <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setShowOverflow(false) }}
                    className="ml-2 text-xs px-2 py-1 bg-blue-600 text-white rounded-md">Réinitialiser</button>
                )}
              </div>
            </div>
            <div className="h-4" />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          EDIT / CREATE MODAL (shared form component)
         ═══════════════════════════════════════════════════════ */}
      {(showEditModal || showCreateModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowEditModal(false); setShowCreateModal(false) }} />
          <div className={`relative bg-gray-800 border border-gray-600 shadow-2xl w-full ${isMobile ? 'max-w-full h-[100dvh] rounded-none flex flex-col' : 'max-w-lg max-h-[85vh] rounded-2xl overflow-y-auto'}`} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={`sticky top-0 bg-gray-800 border-b border-gray-700 flex items-center justify-between shrink-0 ${isMobile ? 'px-4 py-3' : 'rounded-t-2xl px-5 py-4'}`}>
              <div className="min-w-0">
                <h2 className="text-white font-bold text-lg truncate">{showCreateModal ? 'Ajouter un équipement' : 'Modifier l\'équipement'}</h2>
                {editingMachine && <p className="text-gray-400 text-xs mt-0.5">ID: {editingMachine.id}</p>}
              </div>
              <button onClick={() => { setShowEditModal(false); setShowCreateModal(false) }} className="text-gray-400 hover:text-white p-2 shrink-0" aria-label="Fermer"><X size={isMobile ? 24 : 20} /></button>
            </div>
            {/* Body */}
            <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-4 space-y-4' : 'p-5 space-y-4'}`}>
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1">Nom *</label>
                <input type="text" value={editForm.nom} onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))}
                  className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`} placeholder="Convoyeur d'entrée..." />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1">Code interne</label>
                {showCreateModal && editForm.code_interne.trim() && data.machines.some(m => (m.code_interne || '').toUpperCase() === editForm.code_interne.trim().toUpperCase()) && (
                  <p className="text-red-400 text-[10px] mb-1 flex items-center gap-1">
                    <AlertTriangle size={10} /> Ce code interne est déjà utilisé
                  </p>
                )}
                <input type="text" value={editForm.code_interne} onChange={e => setEditForm(f => ({ ...f, code_interne: e.target.value }))}
                  className={`w-full bg-gray-700 border rounded-lg text-white focus:outline-none uppercase ${showCreateModal && editForm.code_interne.trim() && data.machines.some(m => (m.code_interne || '').toUpperCase() === editForm.code_interne.trim().toUpperCase()) ? 'border-red-500 focus:border-red-500' : 'border-gray-600 focus:border-blue-500'} ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`} placeholder="L101" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1">Type</label>
                  <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                    className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`}>
                    {TYPE_OPTIONS.map(t => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1">Statut</label>
                  <select value={editForm.statut} onChange={e => setEditForm(f => ({ ...f, statut: e.target.value }))}
                    className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`}>
                    {STATUT_OPTIONS.map(s => (<option key={s.value} value={s.value}>{s.label}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1">Zone</label>
                  <select value={editForm.zone} onChange={e => setEditForm(f => ({ ...f, zone: e.target.value }))}
                    className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`}>
                    <option value="">— Aucune —</option>
                    {ZONE_OPTIONS.map(z => (<option key={z.value} value={z.value}>{z.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1">Étage</label>
                  <select value={editForm.etage} onChange={e => setEditForm(f => ({ ...f, etage: e.target.value }))}
                    className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`}>
                    <option value="0">E0 (RDC)</option><option value="1">E1</option><option value="2">E2</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1">Ligne</label>
                <input type="text" value={editForm.ligne} onChange={e => setEditForm(f => ({ ...f, ligne: e.target.value }))}
                  className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`} placeholder="Ligne 1" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`} placeholder="Notes optionnelles..." />
              </div>

              {/* ─── Appearance: Color + Size + Rotation ──────────── */}
              <div className="bg-gray-700/30 rounded-lg p-3">
                <label className="block text-gray-400 text-xs font-medium mb-3 flex items-center gap-1.5"><Palette size={12} /> Apparence de l'étiquette</label>
                <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {/* Color */}
                  <div>
                    <label className="block text-gray-500 text-[10px] mb-1.5">Couleur personnalisée</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="color" value={editForm.couleur || '#22c55e'}
                        onChange={e => setEditForm(f => ({ ...f, couleur: e.target.value }))}
                        className={`${isMobile ? 'w-11 h-11' : 'w-9 h-9'} rounded-lg border border-gray-600 cursor-pointer bg-transparent shrink-0`} />
                      <div className={`flex flex-wrap gap-1.5 ${isMobile ? 'max-w-full' : 'max-w-[140px]'}`}>
                        {PRESET_COLORS.map(c => (
                          <button key={c} onClick={() => setEditForm(f => ({ ...f, couleur: f.couleur === c ? '' : c }))}
                            className={`${isMobile ? 'w-8 h-8' : 'w-5 h-5'} rounded-full border-2 transition-transform hover:scale-125 ${editForm.couleur === c ? 'border-white scale-110' : 'border-gray-600'}`}
                            style={{ background: c }} aria-label={`Couleur ${c}`} />
                        ))}
                      </div>
                    </div>
                    {editForm.couleur && (
                      <button onClick={() => setEditForm(f => ({ ...f, couleur: '' }))}
                        className="text-gray-500 text-[10px] mt-1 hover:text-gray-300">Réinitialiser (couleur par défaut)</button>
                    )}
                  </div>
                  {/* Size */}
                  <div>
                    <label className="block text-gray-500 text-[10px] mb-1.5">Taille du texte</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0.3" max="5" step="0.1"
                        value={editForm.taille_pastille || DEFAULT_LABEL_EM}
                        onChange={e => {
                          const val = Math.max(0.3, Math.min(5, parseFloat(e.target.value) || DEFAULT_LABEL_EM))
                          setEditForm(f => ({ ...f, taille_pastille: String(val) }))
                        }}
                        className={`bg-gray-700 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:border-blue-500 ${isMobile ? 'w-20 px-2 py-2.5 text-base' : 'w-20 px-2 py-2 text-sm'}`} />
                      <span className="text-gray-400 text-sm">em</span>
                      <span className="text-gray-600 text-xs hidden sm:inline">(0.3 – 5.0)</span>
                      {editForm.taille_pastille && Number(editForm.taille_pastille) !== DEFAULT_LABEL_EM && (
                        <button onClick={() => setEditForm(f => ({ ...f, taille_pastille: '' }))}
                          className="text-gray-500 text-[10px] hover:text-gray-300 underline ml-auto">Réinit.</button>
                      )}
                    </div>
                    {/* Quick presets for convenience */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {[0.5, 0.7, 0.9, 1.1, 1.4, 1.8, 2.2].map(v => (
                        <button key={v} onClick={() => setEditForm(f => ({ ...f, taille_pastille: String(v) }))}
                          className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'} rounded transition-colors ${Number(editForm.taille_pastille || DEFAULT_LABEL_EM) === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Rotation */}
                <div className="mt-3">
                  <label className="block text-gray-500 text-[10px] mb-1.5">
                    Orientation : {editForm.rotation || '0'}°
                    {Number(editForm.rotation || 0) !== 0 && (
                      <button onClick={() => setEditForm(f => ({ ...f, rotation: '0' }))}
                        className="ml-2 text-gray-500 hover:text-gray-300 underline">Réinitialiser</button>
                    )}
                  </label>
                  <div className="flex items-center gap-3">
                    <input type="range" min="0" max="360" step="5"
                      value={editForm.rotation || '0'}
                      onChange={e => setEditForm(f => ({ ...f, rotation: e.target.value }))}
                      className={`flex-1 accent-amber-400 ${isMobile ? 'h-2' : ''}`} />
                    <input type="number" min="0" max="360" step="5"
                      value={editForm.rotation || '0'}
                      onChange={e => setEditForm(f => ({ ...f, rotation: Math.max(0, Math.min(360, Number(e.target.value) || 0)).toString() }))}
                      className={`bg-gray-700 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:border-blue-500 ${isMobile ? 'w-20 px-2 py-2.5 text-base' : 'w-16 px-2 py-1.5 text-xs'}`} />
                  </div>
                  {/* Live preview */}
                  <div className="flex items-center justify-center mt-2 h-16 bg-gray-800/50 rounded-lg">
                    <span className="font-bold"
                      style={{
                        display: 'inline-block',  // REQUIRED for CSS transform on a <span>
                        fontSize: `${editForm.taille_pastille || DEFAULT_LABEL_EM}em`,
                        color: editForm.couleur || STATUT_DOT[editForm.statut] || '#6b7280',
                        textShadow: '0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.5)',
                        transform: `rotate(${editForm.rotation || '0'}deg)`,
                        transformOrigin: 'center center',
                      }}>
                      CV-201
                    </span>
                  </div>
                </div>
              </div>

              {/* ─── Position ──────────────────────────────────── */}
              <div className="bg-gray-700/30 rounded-lg p-3">
                <label className="block text-gray-400 text-xs font-medium mb-2">Position sur le schéma</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-500 text-[10px] mb-1">pos_x</label>
                    <input type="number" step="0.1" value={editForm.pos_x} onChange={e => setEditForm(f => ({ ...f, pos_x: e.target.value }))}
                      className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`} />
                  </div>
                  <div>
                    <label className="block text-gray-500 text-[10px] mb-1">pos_y</label>
                    <input type="number" step="0.1" value={editForm.pos_y} onChange={e => setEditForm(f => ({ ...f, pos_y: e.target.value }))}
                      className={`w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono ${isMobile ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`} />
                  </div>
                </div>
                {showCreateModal && <p className="text-gray-500 text-[10px] mt-1.5">Position définie par le double-clic. Ajustez si besoin.</p>}
              </div>

              {/* ─── Actions: sticky bottom on mobile, inline on desktop ─── */}
              <div className={`flex gap-3 ${isMobile ? 'sticky bottom-0 -mx-4 px-4 py-3 bg-gray-800 border-t border-gray-700' : 'pt-2'}`}>
                {/* Delete button (edit only) */}
                {showEditModal && editingMachine && (
                  <button onClick={() => { if (confirm(`Supprimer "${editingMachine.nom}" ?`)) handleDeleteMachine(editingMachine.id, editingMachine.nom) }}
                    disabled={deletingId === editingMachine.id}
                    className={`bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${isMobile ? 'py-3.5 px-5 text-base' : 'py-2.5 px-4 text-sm'}`}>
                    {deletingId === editingMachine.id ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400" /> : <Trash2 size={isMobile ? 20 : 16} />}
                  </button>
                )}
                <button onClick={() => { setShowEditModal(false); setShowCreateModal(false) }}
                  className={`flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl font-medium transition-colors ${isMobile ? 'py-3.5 text-base' : 'py-2.5 text-sm'}`}>Annuler</button>
                <button onClick={showCreateModal ? handleCreateMachine : handleSaveEdit}
                  disabled={saving || !editForm.nom.trim()}
                  className={`flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 ${isMobile ? 'py-3.5 text-base' : 'py-2.5 text-sm'}`}>
                  {saving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Sauvegarde...</>)
                    : showCreateModal ? (<><Plus size={isMobile ? 20 : 16} /> Créer</>)
                    : (<><Save size={isMobile ? 20 : 16} /> Enregistrer</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mobile bottom sheet (view mode) ──────────────────── */}
      {isMobile && selectedMachine && !editMode && (
        <div className="fixed inset-0 z-40" onClick={() => setSelectedMachine(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-0 left-0 right-0 bg-gray-800 rounded-t-2xl max-h-[85vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-800 pt-3 pb-2 px-4 border-b border-gray-700 z-10">
              <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-lg truncate">{selectedMachine.code_interne || selectedMachine.nom}</h2>
                <button onClick={() => setSelectedMachine(null)} className="text-gray-400 p-1 shrink-0"><X size={20} /></button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: getColor(selectedMachine) }} />
                <span className="text-sm capitalize" style={{ color: getColor(selectedMachine) }}>{selectedMachine.statut}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">Type</div><div className="text-white font-medium">{TYPE_CONFIG[selectedMachine.type]?.label || selectedMachine.type}</div></div>
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">Zone</div><div className="text-white font-medium">{selectedMachine.zone || '—'}</div></div>
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">Étage</div><div className="text-white font-medium">Étage {selectedMachine.etage}</div></div>
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">Ligne</div><div className="text-white font-medium text-xs">{selectedMachine.ligne || '—'}</div></div>
              </div>
              {selectedMachine.modele && (
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">Modèle</div><div className="text-white font-medium">{selectedMachine.modele}</div></div>
              )}
              <button onClick={() => goToMachine(selectedMachine)} className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-semibold transition-colors min-h-[48px]">Voir la fiche complète</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mobile bottom sheet (edit mode) ──────────────────── */}
      {isMobile && selectedMachine && editMode && draggingId === null && (
        <div className="fixed inset-0 z-40" onClick={() => setSelectedMachine(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-0 left-0 right-0 bg-gray-800 rounded-t-2xl max-h-[70vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-800 pt-3 pb-2 px-4 border-b border-amber-700/30">
              <div className="w-10 h-1 bg-amber-600 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-amber-100 font-bold text-lg">{selectedMachine.code_interne || selectedMachine.nom}</h2>
                <button onClick={() => setSelectedMachine(null)} className="text-gray-400 p-1"><X size={20} /></button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-300 text-xs"><GripVertical size={14} /><span>Glissez la pastille pour déplacer</span></div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">Type</div><div className="text-white font-medium">{TYPE_CONFIG[selectedMachine.type]?.label || selectedMachine.type}</div></div>
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">Zone</div><div className="text-white font-medium">{selectedMachine.zone || '—'}</div></div>
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">pos_x</div><div className="text-amber-300 font-mono text-xs">{selectedMachine.pos_x?.toFixed(1) || '—'}</div></div>
                <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-gray-500 text-xs">pos_y</div><div className="text-amber-300 font-mono text-xs">{selectedMachine.pos_y?.toFixed(1) || '—'}</div></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEditModal(selectedMachine)} className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm"><Pencil size={16} /> Modifier</button>
                <button onClick={() => { if (confirm(`Supprimer "${selectedMachine.nom}" ?`)) handleDeleteMachine(selectedMachine.id, selectedMachine.nom) }}
                  disabled={deletingId === selectedMachine.id}
                  className="py-3 px-4 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl font-semibold transition-colors"><Trash2 size={16} /></button>
                <button onClick={() => goToMachine(selectedMachine)} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors text-sm">Fiche</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Desktop panel (view mode) ────────────────────────── */}
      {!isMobile && selectedMachine && !editMode && (
        <div className="absolute right-0 top-[52px] bottom-0 w-80 bg-gray-800 border-l border-gray-700 z-20 overflow-y-auto shadow-2xl">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4"><h3 className="text-white font-semibold">Détail Équipement</h3><button onClick={() => setSelectedMachine(null)} className="text-gray-400 hover:text-white"><X size={18} /></button></div>
            <div className="space-y-3">
              <div className="bg-gray-700/50 rounded-lg p-3"><div className="text-2xl font-bold text-white">{selectedMachine.code_interne || selectedMachine.nom}</div><div className="text-sm text-gray-400">{selectedMachine.modele || ''}</div></div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-700/30 rounded-lg p-2"><div className="text-gray-500 text-xs">Type</div><div className="text-white font-medium">{TYPE_CONFIG[selectedMachine.type]?.label || selectedMachine.type}</div></div>
                <div className="bg-gray-700/30 rounded-lg p-2"><div className="text-gray-500 text-xs">Zone</div><div className="text-white font-medium">{selectedMachine.zone || '—'}</div></div>
                <div className="bg-gray-700/30 rounded-lg p-2"><div className="text-gray-500 text-xs">Étage</div><div className="text-white font-medium">Étage {selectedMachine.etage}</div></div>
                <div className="bg-gray-700/30 rounded-lg p-2"><div className="text-gray-500 text-xs">Ligne</div><div className="text-white font-medium text-xs">{selectedMachine.ligne || '—'}</div></div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3"><div className="text-gray-500 text-xs mb-1">Statut</div><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: getColor(selectedMachine) }} /><span className="text-white font-medium capitalize">{selectedMachine.statut}</span></div></div>
              <button onClick={() => goToMachine(selectedMachine)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm">Voir la fiche complète</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Desktop panel (edit mode) ────────────────────────── */}
      {!isMobile && selectedMachine && editMode && draggingId === null && (
        <div className="absolute right-0 top-[52px] bottom-0 w-80 bg-gray-800 border-l border-amber-700/30 z-20 overflow-y-auto shadow-2xl">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4"><h3 className="text-amber-100 font-semibold">Modifier l'équipement</h3><button onClick={() => setSelectedMachine(null)} className="text-gray-400 hover:text-white"><X size={18} /></button></div>
            <div className="space-y-3">
              <div className="bg-gray-700/50 rounded-lg p-3 border border-amber-700/20">
                <div className="text-xl font-bold text-white">{selectedMachine.code_interne || selectedMachine.nom}</div>
                <div className="text-sm text-gray-400 mt-0.5">{TYPE_CONFIG[selectedMachine.type]?.label || selectedMachine.type} · {selectedMachine.zone}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-700/30 rounded-lg p-2"><div className="text-gray-500 text-xs">Statut</div><div className="flex items-center gap-1.5 mt-1"><span className="w-2 h-2 rounded-full" style={{ background: getColor(selectedMachine) }} /><span className="text-white font-medium capitalize text-xs">{selectedMachine.statut}</span></div></div>
                <div className="bg-gray-700/30 rounded-lg p-2"><div className="text-gray-500 text-xs">Étage</div><div className="text-white font-medium">E{selectedMachine.etage}</div></div>
                <div className="bg-gray-700/30 rounded-lg p-2"><div className="text-gray-500 text-xs">pos_x</div><div className="text-amber-300 font-mono text-xs">{selectedMachine.pos_x?.toFixed(1) || '—'}</div></div>
                <div className="bg-gray-700/30 rounded-lg p-2"><div className="text-gray-500 text-xs">pos_y</div><div className="text-amber-300 font-mono text-xs">{selectedMachine.pos_y?.toFixed(1) || '—'}</div></div>
              </div>
              <div className="bg-amber-900/20 border border-amber-700/20 rounded-lg p-3 text-amber-200 text-xs space-y-1">
                <p className="font-semibold">Mode édition actif</p>
                <p>Glissez la pastille pour la repositionner. Position sauvegardée au relâchement.</p>
              </div>
              <button onClick={() => openEditModal(selectedMachine)} className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold transition-colors text-sm flex items-center justify-center gap-2"><Pencil size={16} /> Modifier les informations</button>
              <button onClick={() => { if (confirm(`Supprimer "${selectedMachine.nom}" ?`)) handleDeleteMachine(selectedMachine.id, selectedMachine.nom) }}
                disabled={deletingId === selectedMachine.id}
                className="w-full py-2.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2">
                {deletingId === selectedMachine.id ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400" /> : <><Trash2 size={16} /> Supprimer cet équipement</>}
              </button>
              <button onClick={() => goToMachine(selectedMachine)} className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium transition-colors text-sm">Voir la fiche complète</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Multi-select batch action bar ──────────────────── */}
      {multiSelectMode && selectedIds.size > 0 && (
        <div className="fixed left-0 right-0 z-40 bg-gray-800 border-t border-blue-500/30 px-4 py-3 flex items-center justify-between"
          style={isMobile ? { bottom: '4rem' /* sit above the 64px bottom nav */ } : { bottom: 0 }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">{selectedIds.size}</div>
            <span className="text-white font-medium text-sm">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
            <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white text-xs underline">Tout déselectionner</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleBatchDelete} disabled={deletingBatch}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors">
              {deletingBatch ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Trash2 size={16} />}
              Supprimer
            </button>
          </div>
        </div>
      )}

      {/* ─── Mobile legend bar (collapsible to save canvas space) ─── */}
      {isMobile && (
        <div className="shrink-0 bg-gray-800 border-t border-gray-700">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-gray-400 text-[11px] active:bg-gray-700 transition-colors"
            aria-expanded={showLegend}
            aria-label="Basculer la légende">
            <span className="flex items-center gap-1.5">
              <Layers size={12} />
              Légende {showLegend ? '' : '(afficher)'}
            </span>
            <ChevronRight size={12} className={`transition-transform ${showLegend ? 'rotate-90' : ''}`} />
          </button>
          {showLegend && (
            <div className="flex items-center gap-3 px-3 pb-2 overflow-x-auto">
              {Object.entries(TYPE_CONFIG).map(([key, tc]) => (
                <div key={key} className="flex items-center gap-1 shrink-0"><span className="w-2.5 h-2.5 rounded-full" style={{ background: tc.color }} /><span className="text-gray-400 text-[10px]">{tc.label}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}