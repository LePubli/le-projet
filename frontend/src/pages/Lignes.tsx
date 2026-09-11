import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Factory, AlertTriangle, ChevronRight, MoreVertical, Pencil, Trash2, Plus, X, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import ImportExportDialog from '../components/ImportExportDialog'

interface ZoneCount { zone: string; count: number }
interface LigneInfo { ligne: string; site?: string; zones: ZoneCount[]; total: number; en_panne: number }

export default function Lignes() {
  const [lignes, setLignes] = useState<LigneInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [renameModal, setRenameModal] = useState<{ oldName: string; newName: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [showImportExport, setShowImportExport] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()
  const menuRef = useRef<HTMLDivElement>(null)

  const canManage = user?.role === 'admin' || user?.role === 'manager'
  const isAdmin = user?.role === 'admin'

  const fetchLignes = () => {
    api.get('/machines/meta/lignes').then(r => setLignes(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchLignes()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    if (openMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenu])

  const handleRename = async () => {
    if (!renameModal) return
    const newName = renameModal.newName.trim()
    if (!newName) {
      toast.error('Le nom ne peut pas être vide')
      return
    }
    try {
      await api.post('/machines/meta/lignes', {
        ancien_nom: renameModal.oldName,
        nouveau_nom: newName,
      })
      toast.success(`Ligne renommée en "${newName}"`)
      setRenameModal(null)
      fetchLignes()
    } catch {
      toast.error('Erreur lors du renommage')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      const res = await api.delete('/machines/meta/lignes', { data: { nom: deleteConfirm } })
      toast.success(`Ligne "${deleteConfirm}" supprimée (${res.data.affected} machine(s) mise(s) à jour)`)
      setDeleteConfirm(null)
      fetchLignes()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Lignes & Process</h1>
          <p className="text-gray-400 text-sm mt-1">Vue d'ensemble des lignes de production, cliquez pour explorer le schéma et les machines</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <button
              onClick={() => setShowImportExport(true)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
            >
              <Upload size={16} /> Import / Export
            </button>
          )}
          {canManage && (
            <button
              onClick={() => toast('Ajoutez le champ "Ligne" sur vos machines pour créer une nouvelle ligne', { icon: '💡', duration: 4000 })}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Nouvelle ligne
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : lignes.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Factory size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucune ligne définie. Renseignez le champ "Ligne" sur vos machines pour les voir apparaître ici.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lignes.map(l => (
            <div
              key={l.ligne}
              className="relative bg-gray-800 border border-gray-700 rounded-xl p-5 hover:border-orange-500 transition-colors group"
            >
              <button
                onClick={() => navigate(`/lignes/${encodeURIComponent(l.ligne)}`)}
                className="absolute inset-0 w-full h-full z-0 cursor-pointer"
              />

              {canManage && (
                <div className="relative z-10" ref={openMenu === l.ligne ? menuRef : undefined}>
                  <div
                    className="flex justify-end"
                    onClick={handleStop}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenu(openMenu === l.ligne ? null : l.ligne)
                      }}
                      className="p-1 rounded-md hover:bg-gray-700 text-gray-500 hover:text-white transition-colors"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>

                  {openMenu === l.ligne && (
                    <div className="absolute right-0 top-8 z-50 w-40 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenameModal({ oldName: l.ligne, newName: l.ligne })
                          setOpenMenu(null)
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                      >
                        <Pencil size={14} /> Renommer
                      </button>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm(l.ligne)
                            setOpenMenu(null)
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={14} /> Supprimer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="relative z-0 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 bg-orange-500/15 rounded-lg flex items-center justify-center">
                      <Factory size={18} className="text-orange-400" />
                    </div>
                    <div>
                      <h2 className="text-white font-semibold">{l.ligne}</h2>
                      {l.site && <p className="text-xs text-gray-500">{l.site}</p>}
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-600 group-hover:text-orange-400 transition-colors" />
              </div>

              <div className="relative z-0 flex items-center gap-4 mt-4 text-sm">
                <span className="text-gray-300">{l.total} machine{l.total > 1 ? 's' : ''}</span>
                {l.en_panne > 0 && (
                  <span className="flex items-center gap-1 text-red-400">
                    <AlertTriangle size={13} /> {l.en_panne} en panne
                  </span>
                )}
              </div>

              <div className="relative z-0 flex flex-wrap gap-1.5 mt-3">
                {l.zones.map(z => (
                  <span key={z.zone} className="text-[11px] px-2 py-0.5 bg-gray-700/60 text-gray-400 rounded-full">
                    {z.zone} ({z.count})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename Modal */}
      {renameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setRenameModal(null)}>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Renommer la ligne</h3>
              <button onClick={() => setRenameModal(null)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <label className="block text-sm text-gray-400 mb-1">Nom de la ligne</label>
            <input
              autoFocus
              type="text"
              value={renameModal.newName}
              onChange={e => setRenameModal({ ...renameModal, newName: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setRenameModal(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleRename}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Supprimer la ligne</h3>
              <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-gray-300 text-sm">
              Êtes-vous sûr de vouloir supprimer la ligne <span className="font-semibold text-white">{deleteConfirm}</span> ?
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Les machines de cette ligne ne seront pas supprimées, mais leur champ "Ligne" sera vidé.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import / Export Dialog */}
      {showImportExport && (
        <ImportExportDialog
          entity="lignes"
          label="Lignes & Process"
          onClose={() => setShowImportExport(false)}
          onImported={fetchLignes}
        />
      )}
    </div>
  )
}