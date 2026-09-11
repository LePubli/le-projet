/**
 * Scanner — scanne un QR code avec la caméra du smartphone pour ouvrir
 * la fiche machine correspondante.
 *
 * Utilise l'API native BarcodeDetector si disponible (Chrome Android),
 * sinon fallback sur la saisie manuelle du code.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, ScanLine, X, Loader2, Keyboard, AlertTriangle } from 'lucide-react'

export default function Scanner() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<unknown>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [hasCamera, setHasCamera] = useState<boolean | null>(null)
  const [barcodeSupported, setBarcodeSupported] = useState(false)

  // Vérifier le support de BarcodeDetector
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      setBarcodeSupported(true)
    }
    // Vérifier si la caméra est disponible
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then(stream => {
        stream.getTracks().forEach(t => t.stop())
        setHasCamera(true)
      })
      .catch(() => setHasCamera(false))
  }, [])

  // Démarrer le scan
  const startScan = useCallback(async () => {
    setError(null)
    setScanning(true)
    setLoading(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Initialiser BarcodeDetector si supporté
      if ('BarcodeDetector' in window) {
        // @ts-expect-error - BarcodeDetector n'est pas dans les types TS standards
        detectorRef.current = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13']
        })

        // Polling pour détecter les codes
        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || !detectorRef.current) return
          try {
            // @ts-expect-error - detect n'est pas typé
            const barcodes = await detectorRef.current.detect(videoRef.current)
            if (barcodes && barcodes.length > 0) {
              const code = barcodes[0].rawValue
              stopScan()
              handleCodeScanned(code)
            }
          } catch {
            // Erreur de détection non bloquante
          }
        }, 300)
      }
    } catch (e) {
      setError('Impossible d\'accéder à la caméra. Utilisez la saisie manuelle ci-dessous.')
      setScanning(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Arrêter le scan
  const stopScan = useCallback(() => {
    setScanning(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // Cleanup au démontage
  useEffect(() => {
    return () => stopScan()
  }, [stopScan])

  // Handler quand un code est scanné
  const handleCodeScanned = useCallback(async (code: string) => {
    toast.success(`Code lu: ${code}`)
    try {
      const res = await api.get(`/machines/by-code/${encodeURIComponent(code)}`)
      if (res.data.id) {
        toast.success(`Machine trouvée: ${res.data.nom}`)
        navigate(`/machines/${res.data.id}`)
      }
    } catch {
      toast.error(`Aucune machine avec le code "${code}"`)
      // Redémarrer le scan après erreur
      setTimeout(() => startScan(), 1500)
    }
  }, [navigate, startScan])

  // Saisie manuelle
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim()) return
    await handleCodeScanned(manualCode.trim())
  }

  return (
    <div className="min-h-dvh bg-gray-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <button onClick={() => { stopScan(); navigate(-1) }} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-300">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-white font-semibold text-lg flex-1">Scanner QR Code</h1>
      </div>

      {/* Camera view */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        {scanning && (
          <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden border-2 border-orange-500/50">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Overlay cadre de scan */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-orange-400 rounded-2xl relative">
                {/* Coins */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-orange-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-orange-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-orange-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-orange-400 rounded-br-lg" />
                {/* Ligne de scan animée */}
                <div className="absolute inset-x-0 top-0 h-0.5 bg-orange-400 shadow-lg shadow-orange-400/50"
                  style={{ animation: 'scan-line 2s ease-in-out infinite' }} />
              </div>
            </div>
            {/* Bouton stop */}
            <button
              onClick={stopScan}
              className="absolute top-3 right-3 p-2 bg-black/60 rounded-full text-white hover:bg-black/80"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {!scanning && (
          <div className="flex flex-col items-center gap-6 max-w-md w-full">
            {/* Icône caméra */}
            <div className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center">
              <Camera size={48} className="text-orange-400" />
            </div>

            {/* Statut caméra */}
            {hasCamera === false && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-2">
                <AlertTriangle size={14} />
                Caméra non accessible — utilisez la saisie manuelle
              </div>
            )}

            {hasCamera === true && !barcodeSupported && (
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-center">
                <AlertTriangle size={14} className="shrink-0" />
                Votre navigateur ne supporte pas BarcodeDetector. La caméra peut ne pas fonctionner — essayez ou utilisez la saisie manuelle.
              </div>
            )}

            {/* Bouton démarrer scan */}
            {hasCamera !== false && (
              <button
                onClick={startScan}
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-base transition-colors min-h-[48px]"
              >
                {loading ? (
                  <><Loader2 size={20} className="animate-spin" /> Démarrage...</>
                ) : (
                  <><ScanLine size={20} /> Scanner un QR Code</>
                )}
              </button>
            )}

            {/* Saisie manuelle */}
            <div className="w-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-xs text-gray-500 uppercase">ou saisie manuelle</span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <div className="flex-1 relative">
                  <Keyboard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={manualCode}
                    onChange={e => setManualCode(e.target.value)}
                    placeholder="Code machine (ex: L315)"
                    className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-base focus:outline-none focus:border-orange-500"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="px-5 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                >
                  OK
                </button>
              </form>
            </div>

            {/* Info */}
            <p className="text-xs text-gray-600 text-center max-w-xs">
              Scannez le QR code collé sur l'équipement pour accéder directement à sa fiche.
              Le QR code contient le code interne de la machine (ex: L315).
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 mt-4 text-center">{error}</p>
        )}
      </div>

      {/* CSS pour l'animation de la ligne de scan */}
      <style>{`
        @keyframes scan-line {
          0%, 100% { top: 0; }
          50% { top: 100%; }
        }
      `}</style>
    </div>
  )
}
