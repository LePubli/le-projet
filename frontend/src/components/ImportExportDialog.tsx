/**
 * ImportExportDialog — composant réutilisable pour importer / exporter / télécharger
 * un template CSV pour une entité donnée.
 *
 * Props:
 *   - entity: identifiant d'entité côté backend ("machines", "pannes", "bons-travail", ...)
 *   - label: libellé affiché dans le titre (ex: "Machines")
 *   - onClose: callback pour fermer le dialog
 *   - onImported: callback appelé après un import réussi (pour rafraîchir la liste)
 */
import { useState, useRef } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import {
  Upload, Download, FileSpreadsheet, X, CheckCircle2, AlertTriangle,
  Loader2, ArrowRight, FileDown,
} from 'lucide-react'

interface Props {
  entity: string
  label: string
  onClose: () => void
  onImported?: () => void
}

interface ValidationError {
  row: number
  column: string
  message: string
}

interface ValidationResult {
  valid: boolean
  total_rows: number
  valid_rows: number
  error_rows: number
  errors: ValidationError[]
  preview: { row: number; data: Record<string, unknown> }[]
}

interface ImportResult {
  imported: number
  skipped: number
  errors: ValidationError[]
}

type Step = 'idle' | 'validating' | 'validated' | 'importing' | 'done'

export default function ImportExportDialog({ entity, label, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Download template ──────────────────────────────────────
  const downloadTemplate = async () => {
    try {
      const res = await api.get(`/import-export/${entity}/template`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : `template_${entity}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Template téléchargé')
    } catch {
      toast.error('Erreur lors du téléchargement du template')
    }
  }

  // ─── Export ─────────────────────────────────────────────────
  const doExport = async () => {
    try {
      const res = await api.get(`/import-export/${entity}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : `export_${entity}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export CSV téléchargé')
    } catch {
      toast.error('Erreur lors de l\'export')
    }
  }

  // D — Export Excel natif
  const doExportXlsx = async () => {
    try {
      const res = await api.get(`/extra/export/xlsx/${entity}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : `export_${entity}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export Excel téléchargé')
    } catch {
      toast.error('Erreur lors de l\'export Excel')
    }
  }

  // ─── File selection ────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setValidation(null)
      setImportResult(null)
      setStep('idle')
    }
  }

  // ─── Validate (dry-run) ────────────────────────────────────
  const handleValidate = async () => {
    if (!file) return
    setStep('validating')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post(`/import-export/${entity}/validate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setValidation(res.data)
      setStep('validated')
      if (res.data.valid) {
        toast.success(`${res.data.valid_rows} ligne(s) valide(s) — prête à importer`)
      } else {
        toast.error(`${res.data.error_rows} erreur(s) détectée(s) sur ${res.data.total_rows} ligne(s)`)
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Erreur lors de la validation')
      setStep('idle')
    }
  }

  // ─── Import (définitif) ────────────────────────────────────
  const handleImport = async () => {
    if (!file) return
    setStep('importing')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post(`/import-export/${entity}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportResult(res.data)
      setStep('done')
      if (res.data.imported > 0) {
        toast.success(`${res.data.imported} ligne(s) importée(s)`)
        onImported?.()
      } else {
        toast.error('Aucune ligne importée')
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Erreur lors de l\'import')
      setStep('validated')
    }
  }

  const reset = () => {
    setFile(null)
    setValidation(null)
    setImportResult(null)
    setStep('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-800 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0 z-10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-orange-400" />
            Import / Export — {label}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Actions rapides: Template + Export */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-3 p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-xl text-left transition-colors"
            >
              <FileDown size={20} className="text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">Télécharger le template</p>
                <p className="text-gray-400 text-xs">CSV exemple avec en-têtes et 2 lignes</p>
              </div>
            </button>
            <button
              onClick={doExport}
              className="flex items-center gap-3 p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-xl text-left transition-colors"
            >
              <Download size={20} className="text-green-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">Exporter en CSV</p>
                <p className="text-gray-400 text-xs">CSV avec toutes les {label.toLowerCase()}</p>
              </div>
            </button>
            {/* D — Export Excel natif */}
            <button
              onClick={doExportXlsx}
              className="flex items-center gap-3 p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-xl text-left transition-colors"
            >
              <FileSpreadsheet size={20} className="text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">Exporter en Excel (.xlsx)</p>
                <p className="text-gray-400 text-xs">Avec mise en forme, filtres, couleurs</p>
              </div>
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-700" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Importer</span>
            <div className="flex-1 h-px bg-gray-700" />
          </div>

          {/* File input */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Fichier CSV à importer</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
            />
            {file && (
              <p className="text-xs text-gray-400 mt-1.5">
                Fichier: <span className="text-white">{file.name}</span> ({(file.size / 1024).toFixed(1)} Ko)
              </p>
            )}
          </div>

          {/* Validate button */}
          {file && step !== 'done' && (
            <button
              onClick={handleValidate}
              disabled={step === 'validating' || step === 'importing'}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {step === 'validating' ? (
                <><Loader2 size={16} className="animate-spin" /> Validation...</>
              ) : (
                <><CheckCircle2 size={16} /> Valider le fichier (dry-run)</>
              )}
            </button>
          )}

          {/* Validation results */}
          {validation && (
            <div className={`rounded-xl border p-4 ${
              validation.valid
                ? 'bg-green-900/20 border-green-700/50'
                : 'bg-red-900/20 border-red-700/50'
            }`}>
              <div className="flex items-start gap-3 mb-3">
                {validation.valid ? (
                  <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${validation.valid ? 'text-green-300' : 'text-red-300'}`}>
                    {validation.valid ? 'Fichier valide — prêt à importer' : 'Erreurs détectées'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {validation.valid_rows} ligne(s) valide(s) sur {validation.total_rows}
                    {validation.error_rows > 0 && ` • ${validation.error_rows} en erreur`}
                  </p>
                </div>
              </div>

              {/* Preview (5 premières lignes) */}
              {validation.preview.length > 0 && (
                <details className="mb-3">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-white">
                    Aperçu des {validation.preview.length} premières lignes mappées
                  </summary>
                  <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                    {validation.preview.map((p, i) => (
                      <div key={i} className="text-xs bg-gray-800/50 rounded p-2 border border-gray-700">
                        <span className="text-gray-500">Ligne {p.row}:</span>
                        <pre className="text-gray-300 mt-1 whitespace-pre-wrap">{JSON.stringify(p.data, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Erreurs (max 20 affichées) */}
              {validation.errors.length > 0 && (
                <details>
                  <summary className="text-xs text-red-400 cursor-pointer hover:text-red-300">
                    {validation.errors.length} erreur(s) détaillée(s) (cliquez pour voir)
                  </summary>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {validation.errors.slice(0, 20).map((e, i) => (
                      <div key={i} className="text-xs text-red-300 bg-red-900/20 rounded p-1.5">
                        <span className="font-mono text-red-400">L{i + 2}</span>
                        {e.column !== '_' && <span className="text-red-400"> [{e.column}]</span>}: {e.message}
                      </div>
                    ))}
                    {validation.errors.length > 20 && (
                      <p className="text-xs text-gray-500 italic">... et {validation.errors.length - 20} autres</p>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Import button (only if validated OK) */}
          {validation?.valid && step !== 'done' && (
            <button
              onClick={handleImport}
              disabled={step === 'importing'}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors"
            >
              {step === 'importing' ? (
                <><Loader2 size={16} className="animate-spin" /> Import en cours...</>
              ) : (
                <><Upload size={16} /> Importer {validation.valid_rows} ligne(s) en base</>
              )}
            </button>
          )}

          {/* Import result */}
          {step === 'done' && importResult && (
            <div className="rounded-xl border p-4 bg-green-900/20 border-green-700/50">
              <div className="flex items-start gap-3 mb-2">
                <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-300">Import terminé</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {importResult.imported} ligne(s) importée(s)
                    {importResult.skipped > 0 && ` • ${importResult.skipped} ignorée(s)`}
                  </p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <details>
                  <summary className="text-xs text-red-400 cursor-pointer">
                    {importResult.errors.length} erreur(s) pendant l'import
                  </summary>
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 20).map((e, i) => (
                      <div key={i} className="text-xs text-red-300 bg-red-900/20 rounded p-1.5">
                        <span className="font-mono text-red-400">L{e.row}</span>: {e.message}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <button
                onClick={reset}
                className="mt-3 w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Importer un autre fichier
              </button>
            </div>
          )}

          {/* Workflow hint */}
          {step === 'idle' && !file && (
            <div className="text-xs text-gray-500 bg-gray-700/30 rounded-lg p-3 border border-gray-700">
              <p className="font-medium text-gray-400 mb-1.5">Workflow recommandé:</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Téléchargez le template pour voir le format attendu</li>
                <li>Remplissez-le avec vos données (Excel, LibreOffice, etc.)</li>
                <li>Sélectionnez le fichier puis cliquez "Valider"</li>
                <li>Corrigez les erreurs éventuelles, re-validez</li>
                <li>Quand tout est valide, cliquez "Importer"</li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-4 sm:px-6 py-3 flex justify-end gap-2 rounded-b-2xl shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
