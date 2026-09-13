import { useState, useEffect, useMemo, useCallback, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Clock, X, List, Calendar, Plus, Edit2, Trash2, BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'

interface MaintenanceTask {
  id: number
  machine_id: number
  machine_nom: string | null
  titre: string
  description: string | null
  frequence_jours: number
  derniere_execution: string | null
  responsable: string | null
  alert_jours: number
  actif: boolean
  created_at: string
  statut?: 'ok' | 'bientot' | 'en_retard' | 'inconnu'
  jours_restants?: number | null
  prochaine_echeance?: string | null
}

interface MachineOption {
  id: number
  nom: string
}

interface DayTasks {
  date: string // YYYY-MM-DD
  tasks: (MaintenanceTask & { computedStatus: 'ok' | 'bientot' | 'en_retard' })[]
}

interface TaskFormData {
  machine_id: string
  titre: string
  description: string
  frequence_jours: string
  responsable: string
  alert_jours: string
  actif: boolean
}

const emptyForm: TaskFormData = {
  machine_id: '',
  titre: '',
  description: '',
  frequence_jours: '30',
  responsable: '',
  alert_jours: '7',
  actif: true,
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const inputClass = 'w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent'

interface ModalState {
  open: boolean
  editTask: MaintenanceTask | null
  form: TaskFormData
  submitting: boolean
}

const initialModalState: ModalState = {
  open: false,
  editTask: null,
  form: emptyForm,
  submitting: false,
}

type ModalAction =
  | { type: 'OPEN_CREATE' }
  | { type: 'OPEN_EDIT'; task: MaintenanceTask; form: TaskFormData }
  | { type: 'CLOSE' }
  | { type: 'SET_FORM'; form: TaskFormData }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END' }

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_CREATE':
      return { open: true, editTask: null, form: emptyForm, submitting: false }
    case 'OPEN_EDIT':
      return { open: true, editTask: action.task, form: action.form, submitting: false }
    case 'CLOSE':
      return { open: false, editTask: null, form: emptyForm, submitting: false }
    case 'SET_FORM':
      return { ...state, form: action.form }
    case 'SUBMIT_START':
      return { ...state, submitting: true }
    case 'SUBMIT_END':
      return { ...state, submitting: false }
    default:
      return state
  }
}

function computeTasksForMonth(
  tasks: MaintenanceTask[],
  year: number,
  month: number // 0-indexed
): DayTasks[] {
  const result: DayTasks[] = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayDate = new Date(year, month, d)

    const matching: DayTasks['tasks'] = []

    for (const t of tasks) {
      if (!t.actif) continue
      if (!t.derniere_execution) {
        // No last execution: echeance is creation + frequence
        const created = new Date(t.created_at)
        const echeance = new Date(created.getTime() + t.frequence_jours * 86400000)
        if (echeance.toDateString() === dayDate.toDateString()) {
          matching.push({ ...t, computedStatus: 'en_retard' })
        }
        continue
      }

      // Compute all echeances from derniere_execution
      const start = new Date(t.derniere_execution)
      start.setHours(0, 0, 0, 0)
      let echeance = new Date(start.getTime() + t.frequence_jours * 86400000)

      // Check within a reasonable window around this month
      const monthStart = new Date(year, month, 1)
      const monthEnd = new Date(year, month + 1, 1)
      // Also go back a bit to catch overdue tasks
      const searchStart = new Date(monthStart.getTime() - 90 * 86400000)

      while (echeance <= monthEnd && echeance >= searchStart) {
        if (echeance.toDateString() === dayDate.toDateString()) {
          const daysRemaining = Math.ceil((echeance.getTime() - today.getTime()) / 86400000)
          let status: 'ok' | 'bientot' | 'en_retard'
          if (daysRemaining < 0) status = 'en_retard'
          else if (daysRemaining <= t.alert_jours) status = 'bientot'
          else status = 'ok'
          matching.push({ ...t, computedStatus: status, jours_restants: daysRemaining, prochaine_echeance: echeance.toISOString() })
        }
        echeance = new Date(echeance.getTime() + t.frequence_jours * 86400000)
      }
    }

    if (matching.length > 0) {
      result.push({ date: dateStr, tasks: matching })
    }
  }

  return result
}

function getStatusBadge(status: 'ok' | 'bientot' | 'en_retard') {
  switch (status) {
    case 'ok': return 'bg-green-900/40 text-green-300 border-green-700'
    case 'bientot': return 'bg-orange-900/40 text-orange-300 border-orange-700'
    case 'en_retard': return 'bg-red-900/40 text-red-300 border-red-700'
  }
}

function getStatusLabel(status: 'ok' | 'bientot' | 'en_retard', joursRestants?: number | null) {
  switch (status) {
    case 'ok': return 'À jour'
    case 'bientot': return `Dans ${joursRestants ?? 0}j`
    case 'en_retard': return `En retard de ${Math.abs(joursRestants ?? 0)}j`
  }
}

export default function CalendarMaintenance() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'chef_equipe'

  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'calendar' | 'liste' | 'gantt'>('calendar')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // CRUD state
  const [machines, setMachines] = useState<MachineOption[]>([])
  const [modal, dispatchModal] = useReducer(modalReducer, initialModalState)
  const [deleteConfirm, setDeleteConfirm] = useState<MaintenanceTask | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const fetchTasks = useCallback(() => {
    setLoading(true)
    api.get('/maintenance-preventive/')
      .then(r => setTasks(r.data))
      .finally(() => setLoading(false))
  }, [])

  const fetchMachines = useCallback(() => {
    api.get('/machines/', { params: { limit: 500 } })
      .then(r => setMachines(r.data))
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])
  useEffect(() => { fetchMachines() }, [fetchMachines])

  const dayTasksMap = useMemo(() => {
    const map = new Map<string, DayTasks['tasks']>()
    const computed = computeTasksForMonth(tasks, year, month)
    for (const dt of computed) {
      map.set(dt.date, dt.tasks)
    }
    return map
  }, [tasks, year, month])

  // Calendar grid
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()

  const calendarCells: { day: number; dateStr: string; isCurrentMonth: boolean }[] = []

  // Previous month fill
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    calendarCells.push({
      day: d,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: false,
    })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push({
      day: d,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: true,
    })
  }

  // Next month fill
  const remaining = 42 - calendarCells.length
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    calendarCells.push({
      day: d,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: false,
    })
  }

  const goPrev = () => setCurrentDate(new Date(year, month - 1, 1))
  const goNext = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date())

  const selectedTasks = selectedDay ? dayTasksMap.get(selectedDay) : null

  const marquerEffectue = async (id: number, titre: string) => {
    try {
      await api.post(`/maintenance-preventive/${id}/effectuer`)
      toast.success(`"${titre}" marquée comme effectuée`)
      fetchTasks()
    } catch {
      toast.error('Erreur lors de l\'exécution')
    }
  }

  // --- CRUD handlers ---

  const openCreateModal = () => {
    dispatchModal({ type: 'OPEN_CREATE' })
  }

  const openEditModal = (task: MaintenanceTask) => {
    dispatchModal({
      type: 'OPEN_EDIT',
      task,
      form: {
        machine_id: String(task.machine_id),
        titre: task.titre,
        description: task.description || '',
        frequence_jours: String(task.frequence_jours),
        responsable: task.responsable || '',
        alert_jours: String(task.alert_jours),
        actif: task.actif,
      },
    })
  }

  const closeModal = () => {
    dispatchModal({ type: 'CLOSE' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { form, editTask } = modal
    if (!form.machine_id || !form.titre.trim()) {
      toast.error('Machine et titre sont requis')
      return
    }
    const payload = {
      machine_id: Number(form.machine_id),
      titre: form.titre.trim(),
      description: form.description.trim() || null,
      frequence_jours: Number(form.frequence_jours) || 30,
      responsable: form.responsable.trim() || null,
      alert_jours: Number(form.alert_jours) || 7,
      actif: form.actif,
    }
    dispatchModal({ type: 'SUBMIT_START' })
    try {
      if (editTask) {
        await api.put(`/maintenance-preventive/${editTask.id}`, payload)
        toast.success('Tâche mise à jour')
      } else {
        await api.post('/maintenance-preventive/', payload)
        toast.success('Tâche créée')
      }
      closeModal()
      fetchTasks()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur lors de l\'enregistrement')
    } finally {
      dispatchModal({ type: 'SUBMIT_END' })
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await api.delete(`/maintenance-preventive/${deleteConfirm.id}`)
      toast.success('Tâche supprimée')
      setDeleteConfirm(null)
      fetchTasks()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
  const { form, editTask, submitting } = modal

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    )
  }

  if (viewMode === 'liste') {
    navigate('/maintenance-preventive')
    return null
  }

  return (
    <div className="p-4 md:p-6 min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Maintenance Préventive</h1>
            <p className="text-gray-400 text-xs md:text-sm mt-0.5">Vue calendrier des échéances</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Nouvelle tâche</span>
            </button>
          )}
          <button
            onClick={() => setViewMode('liste')}
            className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600"
          >
            <List size={16} />
            <span className="hidden sm:inline">Liste</span>
          </button>
          <button
            onClick={() => setViewMode('gantt')}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${viewMode === 'gantt' ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'}`}
          >
            <BarChart3 size={16} />
            <span className="hidden sm:inline">Gantt</span>
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${viewMode === 'calendar' ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'}`}
          >
            <Calendar size={16} />
            <span className="hidden sm:inline">Calendrier</span>
          </button>
        </div>
      </div>

      {/* Gantt View */}
      {viewMode === 'gantt' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 overflow-x-auto">
          <h2 className="text-sm font-semibold text-white mb-4">Planning Gantt — 3 prochains mois</h2>
          {tasks.filter(t => t.actif).length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">Aucune tâche planifiée</p>
          ) : (
            <div className="min-w-[800px]">
              {/* Header: months */}
              <div className="flex border-b border-gray-700 pb-2 mb-3">
                <div className="w-64 shrink-0 text-xs text-gray-400 font-semibold">Tâche / Machine</div>
                {Array.from({ length: 12 }, (_, i) => {
                  const d = new Date()
                  d.setMonth(d.getMonth() + Math.floor(i / 1))
                  d.setDate(1)
                  d.setMonth(d.getMonth())
                  const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1)
                  return (
                    <div key={i} className="flex-1 text-center text-[10px] text-gray-500 border-l border-gray-700">
                      {monthDate.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                    </div>
                  )
                }).slice(0, 3)}
              </div>
              {/* Task rows */}
              {tasks.filter(t => t.actif).map(task => {
                const nextDate = task.prochaine_echeance ? new Date(task.prochaine_echeance) : null
                const today = new Date()
                const monthsAhead = nextDate ? Math.round((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30)) : -1
                return (
                  <div key={task.id} className="flex items-center py-2 border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <div className="w-64 shrink-0 pr-3">
                      <p className="text-xs text-white truncate">{task.titre}</p>
                      <p className="text-[10px] text-gray-500 truncate">{task.machine_nom || `#${task.machine_id}`} · {task.frequence_jours}j</p>
                    </div>
                    <div className="flex-1 relative h-6">
                      {/* Render bar at the position of the next due date */}
                      {nextDate && monthsAhead >= 0 && monthsAhead < 3 && (
                        <div
                          className="absolute h-6 rounded flex items-center px-2"
                          style={{
                            left: `${(monthsAhead / 3) * 100}%`,
                            width: `${Math.max(8, (task.frequence_jours / 90) * 100)}%`,
                            background: task.statut === 'en_retard' ? '#ef4444' : task.statut === 'bientot' ? '#f97316' : '#3b82f6',
                            minWidth: '60px',
                          }}
                          title={`${task.titre} — ${nextDate.toLocaleDateString('fr-FR')}`}
                        >
                          <span className="text-[9px] text-white truncate">{nextDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                        </div>
                      )}
                      {task.statut === 'en_retard' && (
                        <span className="absolute right-0 top-0 text-[9px] text-red-400">En retard!</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500" /> À temps</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500" /> Bientôt</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> En retard</span>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
      <>
      <div className="flex items-center justify-between mb-4">
        <button onClick={goPrev} className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg border border-gray-700 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <button onClick={goToday} className="flex items-center gap-2 text-white font-semibold text-lg hover:text-orange-400 transition-colors">
          <Calendar size={18} className="text-orange-500" />
          {MONTH_NAMES[month]} {year}
        </button>
        <button onClick={goNext} className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg border border-gray-700 transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> OK</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Bientôt dû</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> En retard</span>
      </div>

      {/* Calendar grid */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-700">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarCells.map((cell, idx) => {
            const cellTasks = dayTasksMap.get(cell.dateStr)
            const isToday = cell.dateStr === todayStr
            const isSelected = cell.dateStr === selectedDay
            const hasRetard = cellTasks?.some(t => t.computedStatus === 'en_retard')
            const hasBientot = cellTasks?.some(t => t.computedStatus === 'bientot')
            const hasOk = cellTasks?.some(t => t.computedStatus === 'ok')

            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(cell.dateStr === selectedDay ? null : cell.dateStr)}
                className={`
                  min-h-[44px] md:min-h-[72px] p-1 md:p-2 border-b border-r border-gray-700/50 text-left
                  transition-colors relative
                  ${!cell.isCurrentMonth ? 'opacity-30' : ''}
                  ${isToday ? 'bg-gray-700/50' : ''}
                  ${isSelected ? 'bg-gray-700 ring-1 ring-orange-500' : 'hover:bg-gray-750'}
                `}
              >
                <span className={`
                  text-xs md:text-sm font-medium
                  ${isToday ? 'text-orange-400' : cell.isCurrentMonth ? 'text-gray-200' : 'text-gray-600'}
                `}>
                  {cell.day}
                </span>

                {cellTasks && cellTasks.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 md:mt-1 flex-wrap">
                    {hasRetard && <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500" />}
                    {hasBientot && <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-yellow-400" />}
                    {hasOk && !hasRetard && !hasBientot && <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-green-500" />}
                    {hasOk && (hasRetard || hasBientot) && <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-green-500" />}
                    {cellTasks.length > 3 && (
                      <span className="text-[9px] text-gray-400 ml-0.5">+{cellTasks.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Task detail panel - desktop side panel / mobile bottom sheet */}
      {selectedDay && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSelectedDay(null)} />

          {/* Panel */}
          <div className={`
            fixed z-50 bg-gray-800 border border-gray-700 overflow-y-auto
            bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl
            lg:top-0 lg:right-0 lg:bottom-0 lg:left-auto lg:w-96 lg:max-h-full lg:rounded-none lg:rounded-l-2xl
            shadow-2xl
          `}>
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">
                  {new Date(selectedDay + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedTasks ? `${selectedTasks.length} tâche${selectedTasks.length > 1 ? 's' : ''}` : 'Aucune tâche'}
                </p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-1.5 text-gray-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {selectedTasks && selectedTasks.length > 0 ? selectedTasks.map(t => {
                const StatusIcon = t.computedStatus === 'en_retard' ? AlertTriangle : t.computedStatus === 'bientot' ? Clock : CheckCircle
                return (
                  <div key={t.id} className="bg-gray-900 rounded-xl border border-gray-700 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${getStatusBadge(t.computedStatus)}`}>
                        <StatusIcon size={11} />
                        {getStatusLabel(t.computedStatus, t.jours_restants)}
                      </span>
                      {canEdit && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEditModal(t)}
                            className="p-1 text-gray-400 hover:text-blue-400 transition-colors"
                            title="Modifier"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(t)}
                            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <h4 className="text-white font-medium text-sm">{t.titre}</h4>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        {t.machine_nom || `Machine #${t.machine_id}`}
                      </span>
                      {t.responsable && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          {t.responsable}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        Tous les {t.frequence_jours}j
                      </span>
                    </div>

                    {t.description && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{t.description}</p>
                    )}

                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => marquerEffectue(t.id, t.titre)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <CheckCircle size={13} />
                        Effectuer
                      </button>
                    </div>
                  </div>
                )
              }) : (
                <div className="text-center py-8 text-gray-500">
                  <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucune tâche prévue ce jour</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      </>
      )}

      {/* Create / Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />

          {/* Modal */}
          <div className="relative bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-semibold text-lg">
                {editTask ? 'Modifier la tâche' : 'Nouvelle tâche de maintenance'}
              </h3>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Machine */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Machine *</label>
                <select
                  value={form.machine_id}
                  onChange={e => dispatchModal({ type: 'SET_FORM', form: { ...form, machine_id: e.target.value } })}
                  required
                  className={inputClass}
                >
                  <option value="">-- Sélectionner une machine --</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
              </div>

              {/* Titre */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Titre *</label>
                <input
                  type="text"
                  value={form.titre}
                  onChange={e => dispatchModal({ type: 'SET_FORM', form: { ...form, titre: e.target.value } })}
                  required
                  placeholder="Ex: Vérification courroies"
                  className={`${inputClass} placeholder-gray-600`}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => dispatchModal({ type: 'SET_FORM', form: { ...form, description: e.target.value } })}
                  rows={3}
                  placeholder="Description de la tâche..."
                  className={`${inputClass} placeholder-gray-600 resize-none`}
                />
              </div>

              {/* Fréquence & Alert */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Fréquence (jours)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.frequence_jours}
                    onChange={e => dispatchModal({ type: 'SET_FORM', form: { ...form, frequence_jours: e.target.value } })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Alerte (jours avant)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.alert_jours}
                    onChange={e => dispatchModal({ type: 'SET_FORM', form: { ...form, alert_jours: e.target.value } })}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Responsable */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Responsable</label>
                <input
                  type="text"
                  value={form.responsable}
                  onChange={e => dispatchModal({ type: 'SET_FORM', form: { ...form, responsable: e.target.value } })}
                  placeholder="Ex: Jean Dupont"
                  className={`${inputClass} placeholder-gray-600`}
                />
              </div>

              {/* Actif toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">Tâche active</label>
                <button
                  type="button"
                  onClick={() => dispatchModal({ type: 'SET_FORM', form: { ...form, actif: !form.actif } })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.actif ? 'bg-orange-500' : 'bg-gray-600'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.actif ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  )}
                  {editTask ? 'Enregistrer' : 'Créer la tâche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-900/40 border border-red-700">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <h3 className="text-white font-semibold">Supprimer cette tâche ?</h3>
            </div>
            <p className="text-gray-400 text-sm mb-6">
              Supprimer la tâche de maintenance <span className="text-white font-medium">"{deleteConfirm.titre}"</span> ? Cette action est irréversible.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}