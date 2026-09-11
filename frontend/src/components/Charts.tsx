/**
 * Graphiques SVG légers — sans dépendance externe (pas de recharts/chart.js).
 * Optimisés pour le dark mode et l'impression.
 */

// ─── Bar Chart (vertical) ─────────────────────────────────────
export function BarChart({ data, color = '#f97316', height = 120 }: {
  data: { label: string; value: number }[]
  color?: string
  height?: number
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  const barWidth = 100 / Math.max(data.length, 1)
  const gap = barWidth * 0.2

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height: `${height}px` }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 20)
        const x = i * barWidth + gap / 2
        const y = height - 10 - h
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={barWidth - gap} height={h}
              fill={color} rx="1" opacity={0.85}
            />
            {d.value > 0 && (
              <text x={x + (barWidth - gap) / 2} y={y - 2} textAnchor="middle"
                fontSize="3" fill="#9ca3af">{d.value}</text>
            )}
            <text x={x + (barWidth - gap) / 2} y={height - 3} textAnchor="middle"
              fontSize="3" fill="#6b7280">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Donut Chart ──────────────────────────────────────────────
export function DonutChart({ data, size = 120 }: {
  data: { label: string; value: number; color: string }[]
  size?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const radius = size / 2 - 10
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 12

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xs text-gray-600">Aucune donnée</span>
      </div>
    )
  }

  let cumulativeAngle = -90 // commence en haut
  const segments = data.map(d => {
    const angle = (d.value / total) * 360
    const startAngle = cumulativeAngle
    const endAngle = cumulativeAngle + angle
    cumulativeAngle = endAngle

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    const x1 = cx + radius * Math.cos(startRad)
    const y1 = cy + radius * Math.sin(startRad)
    const x2 = cx + radius * Math.cos(endRad)
    const y2 = cy + radius * Math.sin(endRad)
    const largeArc = angle > 180 ? 1 : 0

    return {
      path: `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      color: d.color,
      label: d.label,
      value: d.value,
      pct: Math.round((d.value / total) * 100),
    }
  })

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size}>
        {segments.map((s, i) => (
          <path key={i} d={s.path} fill="none" stroke={s.color}
            strokeWidth={strokeWidth} strokeLinecap="round" />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="bold" fill="#fff">
          {total}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="6" fill="#9ca3af">
          total
        </text>
      </svg>
      <div className="space-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-gray-300">{s.label}</span>
            <span className="text-gray-500 ml-auto">{s.value} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Horizontal Bar Chart ─────────────────────────────────────
export function HBarChart({ data, color = '#f97316' }: {
  data: { label: string; value: number }[]
  color?: string
}) {
  const max = Math.max(...data.map(d => d.value), 1)

  if (data.length === 0) {
    return <p className="text-xs text-gray-600 italic py-4 text-center">Aucune donnée</p>
  }

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-24 truncate shrink-0">{d.label}</span>
          <div className="flex-1 bg-gray-700/40 rounded-full h-5 overflow-hidden">
            <div
              className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
              style={{ width: `${(d.value / max) * 100}%`, background: color, minWidth: d.value > 0 ? '24px' : '0' }}
            >
              <span className="text-[10px] text-white font-bold">{d.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
