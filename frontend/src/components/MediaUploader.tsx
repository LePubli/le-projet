/**
 * MediaUploader — composant réutilisable pour uploader et visualiser des
 * médias (photos + vidéos) attachés à une cause ou une solution de panne.
 *
 * Props:
 *   - medias: tableau de { url, type, name }
 *   - onChange: callback(medias) appelé à chaque ajout/suppression
 *   - canEdit: bool — afficher ou non les contrôles d'édition
 *   - label: libellé affiché au-dessus de la zone (ex: "Médias de la cause")
 */
import { useRef, useState, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { Upload, X, Play, Image as ImageIcon, Video as VideoIcon, Loader2, Maximize2 } from 'lucide-react'

export interface MediaItem {
  url: string
  type: 'image' | 'video'
  name?: string
}

interface Props {
  medias: MediaItem[]
  onChange?: (medias: MediaItem[]) => void
  canEdit?: boolean
  label?: string
  /** "sm" pour les listes compactes, "md" par défaut */
  size?: 'sm' | 'md'
}

export default function MediaUploader({ medias, onChange, canEdit = false, label, size = 'md' }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<MediaItem | null>(null)

  // ─── Upload handler ────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Validation préalable côté client
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
    for (const f of files) {
      if (!allowed.includes(f.type)) {
        toast.error(`${f.name} : type non autorisé (JPG, PNG, GIF, WEBP, MP4, WEBM, MOV)`)
        return
      }
      if (f.size > 50 * 1024 * 1024) {
        toast.error(`${f.name} : trop volumineux (max 50 Mo)`)
        return
      }
    }

    setUploading(true)
    const uploaded: MediaItem[] = []
    try {
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        const res = await api.post('/uploads/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        uploaded.push({
          url: res.data.url,
          type: res.data.kind === 'video' ? 'video' : 'image',
          name: res.data.name || file.name,
        })
      }
      onChange?.([...(medias || []), ...uploaded])
      toast.success(`${uploaded.length} média(s) ajouté(s)`)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Erreur lors de l\'upload')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemove = (idx: number) => {
    if (!onChange) return
    const next = (medias || []).filter((_, i) => i !== idx)
    onChange(next)
  }

  // ─── Lightbox keyboard handler ─────────────────────────────────────
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [lightbox])

  // ─── Sizes ─────────────────────────────────────────────────────────
  const thumbSize = size === 'sm' ? 'w-16 h-16' : 'w-24 h-24 sm:w-28 sm:h-28'

  return (
    <div>
      {label && (
        <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
          <ImageIcon size={11} /> {label}
        </p>
      )}

      {/* Existing medias grid */}
      {(medias?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {medias.map((m, idx) => (
            <div key={`${m.url}-${idx}`} className={`relative group ${thumbSize} rounded-lg overflow-hidden border border-gray-600 bg-gray-700 shrink-0`}>
              {m.type === 'image' ? (
                <img
                  src={m.url}
                  alt={m.name || `média ${idx + 1}`}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setLightbox(m)}
                  loading="lazy"
                  onError={(e) => {
                    // Affiche un placeholder visible quand l'image ne se charge pas.
                    // Sert aussi de diagnostic : si on voit ce placeholder, c'est que
                    // l'URL ne retourne pas une image (401/404/CORS).
                    const t = e.currentTarget
                    t.style.display = 'none'
                    const parent = t.parentElement
                    if (parent && !parent.querySelector('[data-error-placeholder]')) {
                      const ph = document.createElement('div')
                      ph.setAttribute('data-error-placeholder', 'true')
                      ph.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:9px;text-align:center;padding:4px;'
                      ph.textContent = 'Image indisponible'
                      parent.appendChild(ph)
                    }
                  }}
                />
              ) : (
                <div className="relative w-full h-full bg-black flex items-center justify-center cursor-pointer"
                  onClick={() => setLightbox(m)}>
                  <video src={m.url} className="w-full h-full object-cover" preload="metadata" muted
                    onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = 'none' }} />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                    <Play size={20} className="text-white fill-white" />
                  </div>
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); setLightbox(m) }}
                  className="w-5 h-5 rounded bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                  title="Agrandir" aria-label="Agrandir">
                  <Maximize2 size={10} />
                </button>
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(idx) }}
                    className="w-5 h-5 rounded bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center"
                    title="Supprimer" aria-label="Supprimer">
                    <X size={10} />
                  </button>
                )}
              </div>

              {/* Type badge */}
              <div className="absolute bottom-0 left-0 px-1 py-0.5 bg-black/60 text-white text-[8px] uppercase tracking-wider rounded-tr">
                {m.type === 'video' ? <VideoIcon size={8} className="inline" /> : <ImageIcon size={8} className="inline" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button (edit mode only) */}
      {canEdit && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded-lg text-xs font-medium transition-colors border border-dashed border-gray-500 ${size === 'sm' ? 'py-1.5' : ''}`}
        >
          {uploading ? (
            <><Loader2 size={12} className="animate-spin" /> Upload...</>
          ) : (
            <><Upload size={12} /> Ajouter photo / vidéo</>
          )}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Lightbox / plein écran */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            aria-label="Fermer"
          >
            <X size={22} />
          </button>

          <div className="max-w-[95vw] max-h-[95vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            {lightbox.type === 'image' ? (
              <img src={lightbox.url} alt={lightbox.name || 'média'} className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg" />
            ) : (
              <video
                src={lightbox.url}
                controls
                autoPlay
                className="max-w-[95vw] max-h-[85vh] rounded-lg"
              />
            )}
            {lightbox.name && (
              <p className="text-white/80 text-sm mt-3 text-center break-all">{lightbox.name}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
