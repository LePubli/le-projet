/**
 * useServiceWorker — hook pour gérer le service worker, les notifications push,
 * et le statut online/offline avec synchronisation automatique.
 *
 * Fonctionnalités :
 * - Enregistrement du service worker au montage
 * - Détection online/offline avec indicateur visuel
 * - Abonnement/désabonnement aux notifications push
 * - File d'attente des opérations hors-ligne (taille affichée)
 * - Synchronisation automatique quand le réseau revient
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'

interface SWState {
  isOnline: boolean
  pushSupported: boolean
  pushSubscribed: boolean
  queueSize: number
  syncing: boolean
}

export function useServiceWorker() {
  const [state, setState] = useState<SWState>({
    isOnline: navigator.onLine,
    pushSupported: false,
    pushSubscribed: false,
    queueSize: 0,
    syncing: false,
  })

  // ─── Register Service Worker ──────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Vérifier le support push
        const pushSupported = 'pushManager' in reg && 'Notification' in window
        setState((s) => ({ ...s, pushSupported }))

        // Vérifier l'abonnement existant
        if (pushSupported) {
          reg.pushManager.getSubscription().then((sub) => {
            setState((s) => ({ ...s, pushSubscribed: !!sub }))
          })
        }
      })
      .catch(() => {})

    // Écouter les messages du SW
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sync-complete') {
        setState((s) => ({ ...s, queueSize: 0, syncing: false }))
      }
    }
    navigator.serviceWorker.addEventListener('message', handleMessage)

    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [])

  // ─── Online/Offline detection ─────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setState((s) => ({ ...s, isOnline: true }))
      // Déclencher la sync
      checkQueueAndSync()
    }
    const goOffline = () => setState((s) => ({ ...s, isOnline: false }))

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // ─── Check queue size from SW ─────────────────────────────
  const checkQueueSize = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const channel = new MessageChannel()
    return new Promise<void>((resolve) => {
      channel.port1.onmessage = (event) => {
        setState((s) => ({ ...s, queueSize: event.data?.queueSize || 0 }))
        resolve()
      }
      reg.active?.postMessage({ type: 'GET_QUEUE_SIZE' }, [channel.port2])
    })
  }, [])

  // Initial queue check
  useEffect(() => {
    checkQueueSize()
  }, [checkQueueSize])

  // ─── Trigger sync ─────────────────────────────────────────
  const checkQueueAndSync = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !navigator.onLine) return
    const reg = await navigator.serviceWorker.ready
    if ('sync' in reg) {
      setState((s) => ({ ...s, syncing: true }))
      try {
        await (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('trimaint-sync')
      } catch {
        // Fallback: rejouer manuellement si Background Sync n'est pas supporté
        setState((s) => ({ ...s, syncing: false }))
      }
    }
  }, [])

  // ─── Subscribe to push ────────────────────────────────────
  const subscribePush = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return false
    try {
      const reg = await navigator.serviceWorker.ready
      // Demander la permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false

      // Récupérer la clé publique VAPID
      const { data } = await api.get('/push/vapid-public-key')
      if (!data.enabled || !data.publicKey) return false

      // S'abonner
      const applicationServerKey = urlBase64ToUint8Array(data.publicKey)
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      })

      // Envoyer l'abonnement au backend
      const subJSON = subscription.toJSON()
      await api.post('/push/subscribe', {
        endpoint: subJSON.endpoint,
        keys: subJSON.keys,
      })

      setState((s) => ({ ...s, pushSubscribed: true }))
      return true
    } catch {
      return false
    }
  }, [])

  // ─── Unsubscribe from push ────────────────────────────────
  const unsubscribePush = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return false
    try {
      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.getSubscription()
      if (subscription) {
        const subJSON = subscription.toJSON()
        await api.post('/push/unsubscribe', {
          endpoint: subJSON.endpoint,
          keys: subJSON.keys,
        })
        await subscription.unsubscribe()
      }
      setState((s) => ({ ...s, pushSubscribed: false }))
      return true
    } catch {
      return false
    }
  }, [])

  return {
    ...state,
    subscribePush,
    unsubscribePush,
    checkQueueSize,
    triggerSync: checkQueueAndSync,
  }
}

// ─── Helper : conversion base64 → Uint8Array pour VAPID ────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
