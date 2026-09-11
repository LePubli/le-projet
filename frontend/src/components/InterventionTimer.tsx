import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Square } from 'lucide-react'
import api from '../services/api'

interface InterventionTimerProps {
  interventionId: number
  startedAt: string | null
  endedAt: string | null
  onTimeUpdate: (startedAt: string, endedAt: string | null) => void
}

export default function InterventionTimer({
  interventionId,
  startedAt: initialStartedAt,
  endedAt: initialEndedAt,
  onTimeUpdate,
}: InterventionTimerProps) {
  const [elapsed, setElapsed] = useState(0) // seconds
  const [isRunning, setIsRunning] = useState(false)
  const [localStartedAt, setLocalStartedAt] = useState<string | null>(initialStartedAt)
  const [localEndedAt, setLocalEndedAt] = useState<string | null>(initialEndedAt)
  const [syncing, setSyncing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<Date | null>(null)

  // ─── Sync initial state from props ─────────────────────────────
  useEffect(() => {
    if (initialStartedAt && !initialEndedAt) {
      // Timer was already running
      const startDate = new Date(initialStartedAt)
      startRef.current = startDate
      const now = new Date()
      setElapsed(Math.floor((now.getTime() - startDate.getTime()) / 1000))
      setIsRunning(true)
    } else if (initialStartedAt && initialEndedAt) {
      // Timer was completed
      const start = new Date(initialStartedAt).getTime()
      const end = new Date(initialEndedAt).getTime()
      setElapsed(Math.floor((end - start) / 1000))
      setIsRunning(false)
    }
    setLocalStartedAt(initialStartedAt)
    setLocalEndedAt(initialEndedAt)
  }, [initialStartedAt, initialEndedAt])

  // ─── Interval tick ─────────────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        if (startRef.current) {
          const now = new Date()
          setElapsed(Math.floor((now.getTime() - startRef.current.getTime()) / 1000))
        }
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning])

  // ─── Format MM:SS ──────────────────────────────────────────────
  const formatTime = useCallback((totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  // ─── START ─────────────────────────────────────────────────────
  const handleStart = async () => {
    setSyncing(true)
    const now = new Date().toISOString()
    try {
      await api.put(`/interventions/${interventionId}`, {
        started_at: now,
        ended_at: null,
      })
      setLocalStartedAt(now)
      setLocalEndedAt(null)
      startRef.current = new Date(now)
      setElapsed(0)
      setIsRunning(true)
      onTimeUpdate(now, null)
    } catch {
      // silent fail — local state unchanged
    } finally {
      setSyncing(false)
    }
  }

  // ─── STOP ──────────────────────────────────────────────────────
  const handleStop = async () => {
    setSyncing(true)
    const now = new Date().toISOString()
    try {
      await api.put(`/interventions/${interventionId}`, {
        started_at: localStartedAt,
        ended_at: now,
      })
      setLocalEndedAt(now)
      setIsRunning(false)
      if (startRef.current) {
        setElapsed(Math.floor((new Date(now).getTime() - startRef.current.getTime()) / 1000))
      }
      onTimeUpdate(localStartedAt || '', now)
    } catch {
      // silent fail
    } finally {
      setSyncing(false)
    }
  }

  // ─── Determine if we can start/stop ────────────────────────────
  const canStart = !isRunning && !localEndedAt && !syncing
  const canStop = isRunning && !syncing
  const isDone = !!localEndedAt

  return (
    <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
      {/* Timer display */}
      <div className="font-mono text-2xl font-bold text-white tracking-wider min-w-[100px] text-center select-none">
        {formatTime(elapsed)}
      </div>

      {/* Start / Stop button */}
      {isDone ? (
        <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
          <Square size={18} className="text-gray-400" />
        </div>
      ) : canStart ? (
        <button
          onClick={handleStart}
          disabled={syncing}
          className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 flex items-center justify-center transition-colors"
          title="Démarrer"
        >
          {syncing ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
          ) : (
            <Play size={20} className="text-white ml-0.5" />
          )}
        </button>
      ) : canStop ? (
        <button
          onClick={handleStop}
          disabled={syncing}
          className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-red-600 hover:bg-red-500 disabled:bg-gray-700 flex items-center justify-center transition-colors"
          title="Arrêter"
        >
          {syncing ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
          ) : (
            <Square size={18} className="text-white" />
          )}
        </button>
      ) : (
        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500" />
        </div>
      )}
    </div>
  )
}