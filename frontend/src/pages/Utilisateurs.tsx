import { useEffect, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Edit2, Trash2, X, KeyRound, ShieldCheck,
  ShieldOff, User, UserCheck, UserX, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Utilisateur {
  id: number
  username: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

const roleColors: Record<string, string> = {
  admin:       'bg-purple-900/50 text-purple-300 border-purple-700',
  manager:     'bg-blue-900/50 text-blue-300 border-blue-700',
  technicien:  'bg-gray-700 text-gray-300 border-gray-600',
  lecteur:     'bg-zinc-700 text-zinc-300 border-zinc-600',
  chef_equipe: 'bg-teal-900/50 text-teal-300 border-teal-700',
}
const roleLabels: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', technicien: 'Technicien',
  lecteur: 'Lecteur', chef_equipe: "Chef d'équipe",
}

const emptyForm = { username: '', email: '', password: '', role: 'technicien' }

export default function Utilisateurs() {
  const { user: me } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState<Utilisateur[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<Utilisateur | null>(null)
  const [resetUser, setResetUser] = useState<Utilisateur | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editForm, setEditForm] = useState({ role: '', email: '', is_active: true })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Rediriger si non-admin
  useEffect(() => {
    if (me && me.role !== 'admin') navigate('/')
  }, [me, navigate])

  const fetchUsers = () => {
    api.get('/auth/users').then(r => setUsers(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { fetchUsers() }, [])

  // --- Création ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/auth/users', form)
      toast.success(`Utilisateur ${form.username} créé`)
      setShowCreate(false)
      setForm(emptyForm)
      fetchUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la création')
    }
  }

  // --- Modification rôle / email / statut ---
  const openEdit = (u: Utilisateur) => {
    setEditUser(u)
    setEditForm({ role: u.role, email: u.email, is_active: u.is_active })
  }
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUser) return
    try {
      await api.put(`/auth/users/${editUser.id}`, editForm)
      toast.success('Utilisateur mis à jour')
      setEditUser(null)
      fetchUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur')
    }
  }

  // --- Toggle actif/inactif rapide ---
  const toggleActive = async (u: Utilisateur) => {
    try {
      await api.put(`/auth/users/${u.id}`, { is_active: !u.is_active })
      toast.success(u.is_active ? 'Compte désactivé' : 'Compte réactivé')
      fetchUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur')
    }
  }

  // --- Reset password ---
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetUser) return
    if (newPassword.length < 6) { toast.error('Mot de passe trop court (min. 6 caractères)'); return }
    if (newPassword !== confirmPassword) { toast.error('Les mots de passe ne correspondent pas'); return }
    try {
      await api.post(`/auth/users/${resetUser.id}/reset-password`, { new_password: newPassword })
      toast.success(`Mot de passe de ${resetUser.username} réinitialisé`)
      setResetUser(null)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur')
    }
  }

  // --- Suppression ---
  const handleDelete = async (u: Utilisateur) => {
    if (!confirm(`Supprimer l'utilisateur « ${u.username} » ? Cette action est irréversible.`)) return
    try {
      await api.delete(`/auth/users/${u.id}`)
      toast.success('Utilisateur supprimé')
      fetchUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erreur')
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestion des utilisateurs</h1>
          <p className="text-gray-400 text-sm mt-1">{users.length} compte{users.length > 1 ? 's' : ''} enregistré{users.length > 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nouvel utilisateur
        </button>
      </div>

      {/* Tableau des utilisateurs */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
              <th className="text-left px-5 py-3">Utilisateur</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Rôle</th>
              <th className="text-left px-5 py-3">Statut</th>
              <th className="text-left px-5 py-3">Créé le</th>
              <th className="text-left px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-500">Chargement...</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className={`border-b border-gray-700 transition-colors ${!u.is_active ? 'opacity-50' : 'hover:bg-gray-700/40'}`}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${u.is_active ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-700 text-gray-500'}`}>
                      {u.username[0].toUpperCase()}
                    </div>
                    <span className="text-white font-medium">{u.username}</span>
                    {u.id === me?.id && (
                      <span className="text-xs text-gray-500 italic">(moi)</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-400">{u.email}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded border text-xs font-medium ${roleColors[u.role] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                    {roleLabels[u.role] || u.role}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {u.is_active
                    ? <span className="flex items-center gap-1 text-green-400 text-xs"><UserCheck size={13} /> Actif</span>
                    : <span className="flex items-center gap-1 text-gray-500 text-xs"><UserX size={13} /> Inactif</span>}
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {new Date(u.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-gray-400 hover:text-blue-400 transition-colors"
                      title="Modifier"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => { setResetUser(u); setNewPassword(''); setConfirmPassword('') }}
                      className="text-gray-400 hover:text-yellow-400 transition-colors"
                      title="Réinitialiser le mot de passe"
                    >
                      <KeyRound size={15} />
                    </button>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => toggleActive(u)}
                        className={`transition-colors ${u.is_active ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-green-400'}`}
                        title={u.is_active ? 'Désactiver' : 'Réactiver'}
                      >
                        {u.is_active ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                      </button>
                    )}
                    {u.id !== me?.id && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="text-gray-400 hover:text-red-400 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Légende des rôles */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-400">Rôles :</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Admin — accès complet</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Manager — validation</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" /> Chef d'équipe — édition + admin</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500 inline-block" /> Technicien — saisie</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" /> Lecteur — lecture seule</span>
      </div>

      {/* ─── Section API Tokens ─── */}
      <ApiTokensSection />

      {/* ─── Modal : Créer un utilisateur ─── */}
      {showCreate && (
        <Modal title="Nouvel utilisateur" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Nom d'utilisateur *">
              <input
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required
                autoFocus
                placeholder="jean.dupont"
                className={inputCls}
              />
            </Field>
            <Field label="Email *">
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                placeholder="jean@triselec.fr"
                className={inputCls}
              />
            </Field>
            <Field label="Mot de passe *">
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
                placeholder="Min. 6 caractères"
                className={inputCls}
              />
            </Field>
            <Field label="Rôle">
              <RoleSelect value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} />
            </Field>
            <ModalActions onCancel={() => setShowCreate(false)} submitLabel="Créer l'utilisateur" />
          </form>
        </Modal>
      )}

      {/* ─── Modal : Modifier un utilisateur ─── */}
      {editUser && (
        <Modal title={`Modifier — ${editUser.username}`} onClose={() => setEditUser(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <Field label="Email">
              <input
                type="email"
                value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Rôle">
              <RoleSelect
                value={editForm.role}
                onChange={v => setEditForm(f => ({ ...f, role: v }))}
                disabled={editUser.id === me?.id}
              />
              {editUser.id === me?.id && (
                <p className="text-xs text-gray-500 mt-1">Vous ne pouvez pas modifier votre propre rôle.</p>
              )}
            </Field>
            <Field label="Statut du compte">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => editUser.id !== me?.id && setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${editForm.is_active ? 'bg-green-500' : 'bg-gray-600'} ${editUser.id === me?.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${editForm.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                <span className="text-sm text-gray-300">{editForm.is_active ? 'Compte actif' : 'Compte désactivé'}</span>
              </label>
              {editUser.id === me?.id && (
                <p className="text-xs text-gray-500 mt-1">Vous ne pouvez pas désactiver votre propre compte.</p>
              )}
            </Field>
            <ModalActions onCancel={() => setEditUser(null)} submitLabel="Enregistrer" />
          </form>
        </Modal>
      )}

      {/* ─── Modal : Réinitialiser le mot de passe ─── */}
      {resetUser && (
        <Modal title={`Réinitialiser — ${resetUser.username}`} onClose={() => setResetUser(null)}>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-xs text-yellow-300">
              <KeyRound size={15} className="shrink-0 mt-0.5" />
              <p>Le nouveau mot de passe sera actif immédiatement. L'utilisateur devra utiliser ce mot de passe à sa prochaine connexion.</p>
            </div>
            <Field label="Nouveau mot de passe *">
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Min. 6 caractères"
                className={inputCls}
                autoFocus
              />
            </Field>
            <Field label="Confirmer le mot de passe *">
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="Répéter le mot de passe"
                className={`${inputCls} ${confirmPassword && confirmPassword !== newPassword ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-red-400 mt-1">Les mots de passe ne correspondent pas</p>
              )}
            </Field>
            <ModalActions onCancel={() => setResetUser(null)} submitLabel="Réinitialiser" submitVariant="yellow" />
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

const inputCls = "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function RoleSelect({ value, onChange, disabled = false }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={`${inputCls} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <option value="technicien">Technicien</option>
      <option value="chef_equipe">Chef d'équipe</option>
      <option value="admin">Admin</option>
      <option value="lecteur">Lecteur (lecture seule)</option>
    </select>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function ModalActions({ onCancel, submitLabel, submitVariant = 'orange' }: {
  onCancel: () => void
  submitLabel: string
  submitVariant?: 'orange' | 'yellow'
}) {
  const btnCls = submitVariant === 'yellow'
    ? 'bg-yellow-600 hover:bg-yellow-500'
    : 'bg-orange-500 hover:bg-orange-600'
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onCancel} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
        Annuler
      </button>
      <button type="submit" className={`flex-1 py-2 ${btnCls} text-white rounded-lg text-sm font-medium transition-colors`}>
        {submitLabel}
      </button>
    </div>
  )
}

// ─── Section API Tokens (intégration ERP) ─────────────────────
interface ApiToken {
  id: number
  name: string
  token: string
  is_active: boolean
  created_at: string
  last_used: string | null
}

function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const fetch = () => {
    api.get('/api-tokens/').then(r => setTokens(r.data)).catch(() => {})
  }
  useEffect(() => { fetch() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const res = await api.post('/api-tokens/', { name: newName.trim() })
      setCreatedToken(res.data.token)
      setNewName('')
      setShowCreate(false)
      toast.success('Token API créé')
      fetch()
    } catch {
      toast.error('Erreur')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce token ?')) return
    await api.delete(`/api-tokens/${id}`)
    toast.success('Token supprimé')
    fetch()
  }

  const handleToggle = async (id: number) => {
    await api.put(`/api-tokens/${id}/toggle`)
    fetch()
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <KeyRound size={18} className="text-orange-400" />
            Tokens API publique
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Pour intégration ERP/supervision — header <code className="bg-gray-700 px-1 rounded text-[10px]">X-API-Token</code></p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-medium transition-colors border border-gray-600"
        >
          <Plus size={14} /> Créer un token
        </button>
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm text-gray-600 italic py-4 text-center bg-gray-800/50 rounded-lg border border-gray-700/50">
          Aucun token API. Créez-en un pour accéder à l'API publique.
        </p>
      ) : (
        <div className="space-y-2">
          {tokens.map(t => (
            <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-800 border border-gray-700 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{t.name}</p>
                <p className="text-xs text-gray-500 font-mono truncate">{t.token.slice(0, 20)}...{t.token.slice(-8)}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  Créé: {new Date(t.created_at).toLocaleDateString('fr-FR')}
                  {t.last_used && ` · Dernier usage: ${new Date(t.last_used).toLocaleDateString('fr-FR')}`}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                {t.is_active ? 'Actif' : 'Désactivé'}
              </span>
              <button onClick={() => handleToggle(t.id)} className="text-xs text-gray-400 hover:text-white p-1" title="Activer/Désactiver">
                {t.is_active ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
              </button>
              <button onClick={() => handleDelete(t.id)} className="text-xs text-red-400 hover:text-red-300 p-1" title="Supprimer">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal création token */}
      {showCreate && (
        <Modal title="Nouveau token API" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Nom du token *">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex: ERP Production, Supervision..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                autoFocus
              />
            </Field>
            <ModalActions onCancel={() => setShowCreate(false)} submitLabel="Créer" />
          </form>
        </Modal>
      )}

      {/* Affichage du token créé (une seule fois) */}
      {createdToken && (
        <Modal title="Token créé — copiez-le maintenant" onClose={() => setCreatedToken(null)}>
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Token (affiché une seule fois) :</p>
              <code className="text-sm text-green-400 break-all font-mono">{createdToken}</code>
            </div>
            <p className="text-xs text-gray-500">
              Utilisez ce token dans le header <code className="bg-gray-700 px-1 rounded">X-API-Token</code> de vos requêtes vers
              <code className="bg-gray-700 px-1 rounded">/api/public/*</code>.
              Exemple : <code className="bg-gray-700 px-1 rounded text-[10px]">curl -H "X-API-Token: {createdToken.slice(0, 10)}..." /api/public/kpi</code>
            </p>
            <button
              onClick={() => { navigator.clipboard.writeText(createdToken); toast.success('Token copié') }}
              className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Copier le token
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
