/**
 * TriMaint Service Worker
 *
 * Fonctionnalités :
 * 1. Cache des assets statiques (offline)
 * 2. Cache des réponses API (stale-while-revalidate pour GET)
 * 3. Background Sync pour rejouer les POST/PUT/DELETE en attente
 * 4. Web Push notifications
 * 5. Indicateur de mise à jour (skipWaiting + clients.claim)
 */

const CACHE_VERSION = 'trimaint-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const API_CACHE = `${CACHE_VERSION}-api`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

// Assets à pré-cacher (sera étendu au runtime)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/process2.jpg',
]

// ─── Install : pré-cache des assets de base ──────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  )
  self.skipWaiting()
})

// ─── Activate : nettoyage des anciens caches ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ─── Fetch : stratégies de cache ────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests (géré par Background Sync)
  if (request.method !== 'GET') {
    // Si on est offline et que c'est un POST/PUT/DELETE, on met en queue
    if (!navigator.onLine && (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE')) {
      event.respondWith(queueRequest(request))
    }
    return
  }

  // Skip chrome-extension et non-http(s)
  if (!url.protocol.startsWith('http')) return

  // Skip les uploads (trop gros pour le cache)
  if (url.pathname.startsWith('/api/uploads/')) return

  // API : stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // Assets statiques : cache-first
  event.respondWith(cacheFirst(request))
})

// ─── Stratégie : Cache First (pour assets statiques) ────────
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Offline : retourner index.html pour la navigation SPA
    if (request.mode === 'navigate') {
      return caches.match('/index.html')
    }
    return new Response('Hors ligne', { status: 503, statusText: 'Offline' })
  }
}

// ─── Stratégie : Stale-While-Revalidate (pour API GET) ──────
async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached) // Offline : utiliser le cache

  return cached || fetchPromise
}

// ─── Queue des requêtes pour Background Sync ────────────────
async function queueRequest(request) {
  const body = await request.clone().text()
  const queueItem = {
    url: request.url,
    method: request.method,
    body: body || null,
    headers: Object.fromEntries(request.headers.entries()),
    timestamp: Date.now(),
  }

  // Stocker dans IndexedDB
  const db = await openQueueDB()
  await db.put('syncQueue', queueItem)

  // Enregistrer pour Background Sync
  if ('sync' in self.registration) {
    self.registration.sync.register('trimaint-sync')
  }

  return new Response(
    JSON.stringify({ queued: true, message: 'Action sauvegardée, sera synchronisée' }),
    { status: 202, headers: { 'Content-Type': 'application/json' } }
  )
}

// ─── Background Sync : rejouer la queue ─────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'trimaint-sync') {
    event.waitUntil(replayQueue())
  }
})

async function replayQueue() {
  const db = await openQueueDB()
  const allKeys = await db.getAllKeys('syncQueue')
  const items = await db.getAll('syncQueue')

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      })
      if (response.ok) {
        await db.delete('syncQueue', allKeys[i])
      }
    } catch {
      // Réseau toujours indisponible — on garde dans la queue
      break
    }
  }

  // Notifier les clients que la sync est terminée
  const clients = await self.clients.matchAll()
  clients.forEach((client) => client.postMessage({ type: 'sync-complete' }))
}

// ─── IndexedDB pour la queue ────────────────────────────────
function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('trimaint-sync-db', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ─── Push notifications ─────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'TriMaint', message: '', url: '/' }
  try {
    if (event.data) data = JSON.parse(event.data.text())
  } catch {
    if (event.data) data.message = event.data.text()
  }

  const options = {
    body: data.message,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    tag: 'trimaint-notification',
    requireInteraction: data.title.includes('Critique'),
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Focus une fenêtre existante si possible
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})

// ─── Message handler (communication avec le frontend) ───────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'GET_QUEUE_SIZE') {
    openQueueDB().then(async (db) => {
      const count = await db.count('syncQueue')
      event.ports[0]?.postMessage({ queueSize: count })
    })
  }
})
