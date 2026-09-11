import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import {
  Wrench, AlertTriangle, ClipboardList, CheckCircle,
  TrendingUp, Clock, AlertCircle, ArrowRight,
} from 'lucide-react'

interface Stats {
  total_machines: number
  total_pannes: number
  total_interventions: number
  interventions_validees: number
  top_pannes: { titre: string; count: number }[]
  avg_repair_minutes: number
  machines_par_statut: { statut: string; count: number }[]
  pannes_par_criticite: { criticite: number; count: number }[]
}

const criticiteLabel = (c: number) => {
  const map: Record<number, { label: string; color: string; bg: string }> = {
    1: { label: 'Très faible', color: 'text-emerald-400', bg: 'bg-emerald-500' },
    2: { label: 'Faible', color: 'text-blue-400', bg: 'bg-blue-500' },
    3: { label: 'Moyen', color: 'text-amber-400', bg: 'bg-amber-500' },
    4: { label: 'Élevé', color: 'text-orange-400', bg: 'bg-orange-500' },
    5: { label: 'Critique', color: 'text-red-400', bg: 'bg-red-500' },
  }
  return map[c] || { label: `Niveau ${c}`, color: 'text-slate-400', bg: 'bg-slate-500' }
}

const statutColor: Record<string, string> = {
  operationnel: 'text-emerald-400',
  en_panne: 'text-red-400',
  maintenance: 'text-amber-400',
  arret: 'text-slate-400',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/stats/').then(r => setStats(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
    </div>
  )

  const maxPanne = Math.max(...(stats?.top_pannes.map(p => p.count) || [1]), 1)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto pb-24 sm:pb-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Tableau de bord</h1>
        <p className="text-slate-400 text-sm mt-1">Vue d'ensemble de la maintenance Triselec</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard
          icon={<Wrench size={20} />}
          label="Machines"
          value={stats?.total_machines ?? 0}
          gradient="from-blue-500 to-blue-600"
          onClick={() => navigate('/machines')}
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Pannes"
          value={stats?.total_pannes ?? 0}
          gradient="from-red-500 to-red-600"
          onClick={() => navigate('/pannes')}
        />
        <StatCard
          icon={<ClipboardList size={20} />}
          label="Interventions"
          value={stats?.total_interventions ?? 0}
          gradient="from-amber-500 to-orange-600"
        />
        <StatCard
          icon={<CheckCircle size={20} />}
          label="Validées"
          value={stats?.interventions_validees ?? 0}
          gradient="from-emerald-500 to-green-600"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Top pannes — 2 cols */}
        <div className="lg:col-span-2 bg-[#1e293b] rounded-2xl border border-[#334155] p-5 sm:p-6 shadow-md">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-400" />
              Top Pannes récurrentes
            </h2>
            <button onClick={() => navigate('/pannes')} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Voir tout <ArrowRight size={12} />
            </button>
          </div>
          {stats?.top_pannes.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">Aucune panne enregistrée</p>
          ) : (
            <div className="space-y-3">
              {stats?.top_pannes.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-mono w-6 shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{p.titre}</p>
                    <div className="h-1.5 bg-slate-700/50 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
                        style={{ width: `${(p.count / maxPanne) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-indigo-400 shrink-0 w-8 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4 sm:space-y-6">
          {/* Avg repair */}
          <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-5 shadow-md">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock size={14} className="text-indigo-400" />
              Temps moyen réparation
            </h2>
            <div className="flex items-baseline gap-1">
              <p className="text-4xl font-bold text-white">{stats?.avg_repair_minutes ?? 0}</p>
              <span className="text-sm text-slate-400">min</span>
            </div>
          </div>

          {/* Machines par statut */}
          <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-5 shadow-md">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Wrench size={14} className="text-indigo-400" />
              État des machines
            </h2>
            <div className="space-y-2.5">
              {stats?.machines_par_statut.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className={`text-sm capitalize ${statutColor[s.statut] || 'text-slate-400'}`}>
                    {s.statut.replace('_', ' ')}
                  </span>
                  <span className="text-sm font-bold text-white bg-slate-700/40 px-2 py-0.5 rounded-md">{s.count}</span>
                </div>
              ))}
              {!stats?.machines_par_statut.length && <p className="text-slate-500 text-sm">Aucune machine</p>}
            </div>
          </div>

          {/* Pannes par criticité */}
          <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-5 shadow-md">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertCircle size={14} className="text-indigo-400" />
              Pannes par criticité
            </h2>
            <div className="space-y-2">
              {stats?.pannes_par_criticite.map((p, i) => {
                const { label, color, bg } = criticiteLabel(p.criticite)
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${bg} shrink-0`} />
                    <span className="text-sm text-slate-300 flex-1">{label}</span>
                    <span className="text-sm font-bold text-white">{p.count}</span>
                  </div>
                )
              })}
              {!stats?.pannes_par_criticite.length && <p className="text-slate-500 text-sm">Aucune panne</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modern StatCard ───
function StatCard({ icon, label, value, gradient, onClick }: {
  icon: React.ReactNode
  label: string
  value: number
  gradient: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="bg-[#1e293b] rounded-2xl border border-[#334155] p-4 sm:p-5 shadow-md hover:shadow-lg hover:border-slate-600 transition-all duration-200 text-left group"
    >
      <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${gradient} mb-3 shadow-lg`}>
        <span className="text-white">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
    </button>
  )
}
