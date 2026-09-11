import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { DonutChart, HBarChart } from '../components/Charts'
import {
  ArrowLeft, TrendingUp, TrendingDown, Clock, CheckCircle,
  AlertTriangle, Wrench, Package, BarChart3, Activity,
  ChevronRight, Zap, ClipboardList
} from 'lucide-react'

/* ─── Backend response shape (matches /api/kpi/dashboard exactly) ─── */
interface KPIData {
  mttr: number
  mtbf: number
  taux_disponibilite: number
  taux_pannes_resolues: number
  top_machines_pannes: { machine_id: number; machine_nom: string; panne_count: number }[]
  pannes_par_zone: { zone: string; count: number }[]
  pannes_par_type: { type_equipement: string; count: number }[]
  interventions_par_technicien: { technicien: string; count: number }[]
  temps_par_technicien: { technicien: string; total_minutes: number }[]
  pieces_utilisees: { piece_id: number; reference: string; nom: string; total_utilisee: number }[]
  monthly_trend: { year: number; month: number; count: number }[]
  criticite_distribution: { criticite: number; count: number }[]
  bt_statut_distribution: { statut: string; count: number }[]
  total_pannes: number
  total_machines: number
}

/* ─── Separate fetch for pannes récentes (/api/pannes/?limit=5) ─── */
interface PanneRecente {
  id: number
  titre: string
  machine_id: number
  machine_nom?: string | null
  created_at: string
  criticite: number
}

const MOIS_NOMS = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
]

/** Convert monthly_trend entries to display-ready objects with French month label */
function formatMonthlyTrend(
  trend: KPIData['monthly_trend'],
): { mois: string; pannes: number }[] {
  return trend.map(m => ({
    mois: `${MOIS_NOMS[m.month - 1]} ${m.year}`,
    pannes: m.count,
  }))
}

export default function DashboardSuperviseur() {
  const navigate = useNavigate()
  const [data, setData] = useState<KPIData | null>(null)
  const [pannesRecentes, setPannesRecentes] = useState<PanneRecente[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/kpi/dashboard').then(r => r.data),
      api.get('/pannes/', { params: { limit: 5 } }).then(r => r.data),
    ])
      .then(([kpiData, recentPannes]) => {
        setData(kpiData)
        setPannesRecentes(recentPannes)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white">Dashboard Superviseur</h1>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-10 text-center text-gray-500">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Impossible de charger les données KPI</p>
        </div>
      </div>
    )
  }

  // Derived data for charts
  const tendanceMensuelle = formatMonthlyTrend(data.monthly_trend)
  const maxZonePannes = Math.max(...data.pannes_par_zone.map(z => z.count), 1)
  const maxTechnicien = Math.max(...data.interventions_par_technicien.map(t => t.count), 1)
  const maxMensuel = Math.max(...tendanceMensuelle.map(m => m.pannes), 1)

  return (
    <div className="p-4 md:p-6 min-h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Dashboard Superviseur</h1>
          <p className="text-gray-400 text-xs md:text-sm mt-0.5">Indicateurs clés de performance</p>
        </div>
      </div>

      {/* ─── ROW 1: KPI Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        {/* MTTR */}
        <KPICard
          icon={<Clock className="text-blue-400" size={22} />}
          label="MTTR"
          value={`${data.mttr}`}
          unit="min"
          bg="bg-blue-500/10"
          trend={null}
        />

        {/* MTBF */}
        <KPICard
          icon={<Activity className="text-purple-400" size={22} />}
          label="MTBF"
          value={`${data.mtbf}`}
          unit="h"
          bg="bg-purple-500/10"
          trend={null}
          trendInverted
        />

        {/* Taux de disponibilité */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 md:p-5">
          <div className="inline-flex p-2 rounded-lg bg-green-500/10 mb-3">
            <Zap className="text-green-400" size={22} />
          </div>
          <p className="text-3xl font-bold text-white">
            {data.taux_disponibilite.toFixed(1)}
            <span className="text-base font-normal text-gray-400 ml-0.5">%</span>
          </p>
          <p className="text-sm text-gray-400 mt-1">Taux de disponibilité</p>
          <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                data.taux_disponibilite >= 85 ? 'bg-green-500' :
                data.taux_disponibilite >= 70 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, data.taux_disponibilite)}%` }}
            />
          </div>
        </div>

        {/* Taux de résolution */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 md:p-5">
          <div className="inline-flex p-2 rounded-lg bg-orange-500/10 mb-3">
            <CheckCircle className="text-orange-400" size={22} />
          </div>
          <p className="text-3xl font-bold text-white">
            {data.taux_pannes_resolues.toFixed(1)}
            <span className="text-base font-normal text-gray-400 ml-0.5">%</span>
          </p>
          <p className="text-sm text-gray-400 mt-1">Taux de résolution</p>
          <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                data.taux_pannes_resolues >= 80 ? 'bg-green-500' :
                data.taux_pannes_resolues >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, data.taux_pannes_resolues)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ─── ROW 1.5: Donut criticité + Statut BT ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Distribution par criticité — donut */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" />
            Distribution par criticité
          </h2>
          <DonutChart
            data={(data.criticite_distribution || []).map(d => ({
              label: `Niv. ${d.criticite}`,
              value: d.count,
              color: ['', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'][d.criticite] || '#6b7280',
            }))}
            size={130}
          />
        </div>

        {/* Statut des Bons de Travail — barres horizontales */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <ClipboardList size={16} className="text-blue-400" />
            Bons de Travail par statut
          </h2>
          <HBarChart
            data={(data.bt_statut_distribution || []).map(d => ({
              label: d.statut,
              value: d.count,
            }))}
            color="#3b82f6"
          />
          <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center justify-between text-xs text-gray-500">
            <span>Total BT: {(data.bt_statut_distribution || []).reduce((s, d) => s + d.count, 0)}</span>
            <span>Total machines: {data.total_machines}</span>
          </div>
        </div>
      </div>

      {/* ─── ROW 2: Bar Charts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Pannes par zone */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            Pannes par zone
          </h2>
          {data.pannes_par_zone.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune donnée</p>
          ) : (
            <div className="space-y-2.5">
              {data.pannes_par_zone.map((z, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-300 w-24 truncate text-right shrink-0">{z.zone}</span>
                  <div className="flex-1 h-6 bg-gray-700 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-md transition-all duration-700 flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(4, (z.count / maxZonePannes) * 100)}%` }}
                    >
                      {z.count > 1 && <span className="text-[10px] font-bold text-white drop-shadow">{z.count}</span>}
                    </div>
                  </div>
                  {z.count <= 1 && <span className="text-xs text-gray-400 w-4">{z.count}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interventions par technicien */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Wrench size={16} className="text-blue-400" />
            Interventions par technicien
          </h2>
          {data.interventions_par_technicien.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune donnée</p>
          ) : (
            <div className="space-y-2.5">
              {data.interventions_par_technicien.map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-300 w-24 truncate text-right shrink-0">{t.technicien}</span>
                  <div className="flex-1 h-6 bg-gray-700 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-md transition-all duration-700 flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(4, (t.count / maxTechnicien) * 100)}%` }}
                    >
                      {t.count > 1 && <span className="text-[10px] font-bold text-white drop-shadow">{t.count}</span>}
                    </div>
                  </div>
                  {t.count <= 1 && <span className="text-xs text-gray-400 w-4">{t.count}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── ROW 3: Lists ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Top 5 machines fragiles */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-400" />
            Top 5 machines les plus fragiles
          </h2>
          {data.top_machines_pannes.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune donnée</p>
          ) : (
            <div className="space-y-2">
              {data.top_machines_pannes.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-gray-900 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-bold text-gray-500 w-4">{i + 1}</span>
                    <span className="text-sm text-white truncate">{m.machine_nom}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded border border-red-800">
                      {m.panne_count} panne{m.panne_count > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 10 pièces */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Package size={16} className="text-green-400" />
            Top 10 pièces les plus utilisées
          </h2>
          {data.pieces_utilisees.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune donnée</p>
          ) : (
            <div className="space-y-1.5">
              {data.pieces_utilisees.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-700/50 last:border-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-bold text-gray-500 w-4">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{p.nom}</p>
                      <p className="text-[10px] text-gray-500 font-mono">{p.reference}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-green-400 shrink-0">{p.total_utilisee}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── ROW 4: Trend + Pannes récentes ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly trend - CSS line chart */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-orange-400" />
            Tendance mensuelle (12 mois)
          </h2>
          {tendanceMensuelle.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune donnée</p>
          ) : (
            <div className="relative">
              {/* Y axis labels */}
              <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-[10px] text-gray-500 text-right pr-1">
                <span>{maxMensuel}</span>
                <span>{Math.round(maxMensuel / 2)}</span>
                <span>0</span>
              </div>

              <div className="ml-10">
                {/* Grid lines */}
                <div className="relative h-40">
                  <div className="absolute inset-0 flex flex-col justify-between">
                    <div className="border-b border-gray-700/50 w-full" />
                    <div className="border-b border-gray-700/50 w-full" />
                    <div className="border-b border-gray-700 w-full" />
                  </div>

                  {/* SVG line */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Area fill */}
                    <polygon
                      fill="url(#lineGrad)"
                      points={
                        tendanceMensuelle.map((m, i) => {
                          const x = (i / (tendanceMensuelle.length - 1)) * 100
                          const y = 100 - (m.pannes / maxMensuel) * 95
                          return `${x},${y}`
                        }).join(' ') +
                        ` 100,100 0,100`
                      }
                    />
                    {/* Line */}
                    <polyline
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      points={
                        tendanceMensuelle.map((m, i) => {
                          const x = (i / (tendanceMensuelle.length - 1)) * 100
                          const y = 100 - (m.pannes / maxMensuel) * 95
                          return `${x},${y}`
                        }).join(' ')
                      }
                    />
                    {/* Dots */}
                    {tendanceMensuelle.map((m, i) => {
                      const x = (i / (tendanceMensuelle.length - 1)) * 100
                      const y = 100 - (m.pannes / maxMensuel) * 95
                      return (
                        <circle key={i} cx={x} cy={y} r="1.5" fill="#f97316" stroke="#1f2937" strokeWidth="0.5" />
                      )
                    })}
                  </svg>
                </div>

                {/* X axis labels */}
                <div className="flex justify-between mt-1.5 text-[10px] text-gray-500">
                  {tendanceMensuelle.map((m, i) => (
                    <span key={i} className={
                      tendanceMensuelle.length > 8
                        ? i % 2 === 0 ? '' : 'hidden'
                        : ''
                    }>
                      {m.mois}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pannes récentes */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Zap size={16} className="text-red-400" />
            Pannes récentes
          </h2>
          {pannesRecentes.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune panne récente</p>
          ) : (
            <div className="space-y-2">
              {pannesRecentes.map(p => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/pannes/${p.id}`)}
                  className="w-full text-left p-3 bg-gray-900 rounded-lg border border-gray-700 hover:border-orange-500 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate group-hover:text-orange-300 transition-colors">
                        {p.titre}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {p.machine_nom || `Machine #${p.machine_id}`} · {new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        p.criticite >= 4 ? 'bg-red-900/50 text-red-400' :
                        p.criticite >= 3 ? 'bg-yellow-900/50 text-yellow-400' :
                        'bg-green-900/50 text-green-400'
                      }`}>
                        Niv. {p.criticite}
                      </span>
                      <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Reusable KPI Card with trend ─── */
function KPICard({
  icon, label, value, unit, bg, trend, trendInverted
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  bg: string
  trend: number | null
  trendInverted?: boolean
}) {
  const isPositive = trend !== null
    ? trendInverted
      ? trend >= 0 // For MTBF, positive is good
      : trend <= 0 // For MTTR, negative is good
    : null

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`inline-flex p-2 rounded-lg ${bg}`}>{icon}</div>
        {trend !== null && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-3xl font-bold text-white">
        {value}
        <span className="text-base font-normal text-gray-400 ml-1">{unit}</span>
      </p>
      <p className="text-sm text-gray-400 mt-1">{label}</p>
    </div>
  )
}