/**
 * CarteMachines — carte interactive des machines avec positions GPS.
 * Utilise Leaflet + OpenStreetMap (gratuit, pas d'API key).
 * Les machines sans GPS sont listées en dessous pour assignation.
 */
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { ArrowLeft, MapPin, AlertTriangle, Navigation } from 'lucide-react'
import toast from 'react-hot-toast'

interface MachineMap {
  id: number
  nom: string
  code_interne: string | null
  statut: string
  zone: string | null
  ligne: string | null
  latitude: number | null
  longitude: number | null
}

// Charger Leaflet dynamiquement
function loadLeaflet(): Promise<typeof import('leaflet')> {
  return import('leaflet').then(L => {
    // CSS
    if (!document.querySelector('#leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    // Fix marker icons
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
    return L
  })
}

const STATUT_COLORS: Record<string, string> = {
  operationnel: '#22c55e',
  en_panne: '#ef4444',
  maintenance: '#f97316',
  arret: '#6b7280',
}

export default function CarteMachines() {
  const navigate = useNavigate()
  const mapRef = useRef<HTMLDivElement>(null)
  const [machines, setMachines] = useState<MachineMap[]>([])
  const [loading, setLoading] = useState(true)
  const [leafletLoaded, setLeafletLoaded] = useState(false)

  useEffect(() => {
    loadLeaflet().then(() => setLeafletLoaded(true)).catch(() => toast.error('Impossible de charger la carte'))
    api.get('/machines/?limit=500').then(r => setMachines(r.data)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || machines.length === 0) return

    let map: import('leaflet').Map | null = null
    loadLeaflet().then(L => {
      map = L.map(mapRef.current!).setView([46.6, 2.5], 5) // France centre par défaut

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const withGps = machines.filter(m => m.latitude && m.longitude)

      withGps.forEach(m => {
        const color = STATUT_COLORS[m.statut] || '#6b7280'
        const marker = L.circleMarker([m.latitude!, m.longitude!], {
          radius: 8,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        }).addTo(map!)

        marker.bindPopup(
          `<div style="min-width:150px;">
            <strong>${m.nom}</strong><br/>
            <span style="color:${color};">● ${m.statut}</span><br/>
            <span style="color:#666;font-size:11px;">${m.code_interne || ''} · ${m.zone || ''}</span><br/>
            <a href="/machines/${m.id}" style="color:#f97316;font-size:12px;">Voir la fiche →</a>
          </div>`
        )
      })

      if (withGps.length > 0) {
        const bounds = L.latLngBounds(withGps.map(m => [m.latitude!, m.longitude!] as [number, number]))
        map!.fitBounds(bounds, { padding: [40, 40] })
      }
    })

    // Cleanup
    return () => { if (map) map.remove() }
  }, [leafletLoaded, machines])

  const withoutGps = machines.filter(m => !m.latitude || !m.longitude)

  return (
    <div className="p-3 sm:p-6 pb-24 sm:pb-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Navigation size={20} className="text-orange-400" />
            Carte des équipements
          </h1>
          <p className="text-xs text-gray-400">
            {machines.filter(m => m.latitude).length} machine(s) géolocalisée(s) sur {machines.length}
          </p>
        </div>
      </div>

      {/* Carte */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-4">
        {loading ? (
          <div className="flex items-center justify-center h-96 text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : (
          <div ref={mapRef} style={{ height: '500px', width: '100%' }} />
        )}
      </div>

      {/* Machines sans GPS */}
      {withoutGps.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <MapPin size={14} className="text-gray-500" />
            Machines sans position GPS ({withoutGps.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {withoutGps.slice(0, 30).map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/machines/${m.id}`)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors"
              >
                {m.statut === 'en_panne' && <AlertTriangle size={11} className="text-red-400" />}
                {m.code_interne || m.nom}
              </button>
            ))}
            {withoutGps.length > 30 && (
              <span className="text-xs text-gray-500 self-center">+ {withoutGps.length - 30} autres</span>
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            Cliquez sur une machine pour ajouter ses coordonnées GPS dans sa fiche.
          </p>
        </div>
      )}
    </div>
  )
}
