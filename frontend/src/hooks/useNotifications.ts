import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

export interface Notification {
  id: number
  title: string
  message: string
  type: string
  entity_type: string | null
  entity_id: number | null
  created_at: string
  is_read: boolean
}

export function useNotifications() {
  const { user } = useAuth()
  const canReceive = user?.role === 'admin' || user?.role === 'chef_equipe'

  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCount = useCallback(() => {
    if (!canReceive) return
    api.get('/notifications/unread-count')
      .then(r => setUnreadCount(r.data.count))
      .catch(() => {})
  }, [canReceive])

  const fetchNotifications = useCallback(() => {
    if (!canReceive) return
    setLoading(true)
    api.get('/notifications/')
      .then(r => setNotifications(r.data))
      .finally(() => setLoading(false))
  }, [canReceive])

  useEffect(() => {
    fetchCount()
    intervalRef.current = setInterval(fetchCount, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchCount])

  const openPanel = useCallback(() => {
    setPanelOpen(true)
    fetchNotifications()
  }, [fetchNotifications])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
  }, [])

  const markRead = useCallback(async (id: number) => {
    await api.post(`/notifications/${id}/lire`)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/lire-tout')
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }, [])

  return {
    unreadCount,
    notifications,
    panelOpen,
    loading,
    openPanel,
    closePanel,
    markRead,
    markAllRead,
    canReceive,
  }
}
