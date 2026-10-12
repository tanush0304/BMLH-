const TONES = {
  blue: { card: 'bg-[#EAF3FE] border-[#CFE2F8]', icon: 'bg-[#1669E0]' },
  green: { card: 'bg-[#EAF8EF] border-[#C7EBD3]', icon: 'bg-[#16A34A]' },
  orange: { card: 'bg-[#FEF4E8] border-[#F6DDBC]', icon: 'bg-[#F08C1A]' },
  purple: { card: 'bg-[#F3EEFD] border-[#DCCFF7]', icon: 'bg-[#7C3AED]' },
  red: { card: 'bg-[#FDECEC] border-[#F5CACA]', icon: 'bg-[#DC2626]' },
  teal: { card: 'bg-[#E8F7F5] border-[#C2E9E3]', icon: 'bg-[#0F9F8F]' },
}

export function formatQty(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })
}

/** "▲ 12%" / "▼ 3.2 pts" line under a KPI. good = whether a rise is good
 * (production) or bad (rejects): colours green/red accordingly. */
function Delta({ delta }) {
  if (!delta || delta.value == null) return <div className="text-[12px] text-slate-400">— {delta?.caption}</div>
  const up = delta.value > 0
  const flat = delta.value === 0
  const good = flat ? null : up === (delta.higherIsBetter ?? true)
  const colour = good == null ? 'text-slate-500' : good ? 'text-green-600' : 'text-red-600'
  return (
    <div className="text-[12px] text-slate-600">
      <span className={`font-semibold ${colour}`}>
        {flat ? '■' : up ? '▲' : '▼'} {Math.abs(delta.value).toFixed(1)}{delta.unit ?? '%'}
      </span>{' '}
      {delta.caption}
    </div>
  )
}

/** One KPI tile: icon, label, big value + unit, optional sub-line (e.g. "(2.6 %)"),
 * optional delta ({ value, unit, caption, higherIsBetter }) and side content. */
export function KpiCard({ label, value, unit, sub, delta, side, icon: Icon, tone = 'blue', loading }) {
  const t = TONES[tone] ?? TONES.blue
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${t.card}`}>
      {Icon && (
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ${t.icon}`}>
          <Icon size={22} />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[13px] font-semibold leading-tight text-slate-700">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-ink">{loading ? '—' : value}</span>
          {unit && !loading && <span className="text-[13px] text-slate-600">{unit}</span>}
        </div>
        {sub && !loading && <div className="text-[12px] text-slate-600">{sub}</div>}
        {delta && !loading && <Delta delta={delta} />}
      </div>
      {side && !loading && <div className="ml-auto pl-2">{side}</div>}
    </div>
  )
}

/** Responsive row of KpiCards (2 per row on small screens, all in one row on wide). */
export function KpiCardRow({ children, columns = 6 }) {
  const xl = columns === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-6'
  return <div className={`grid grid-cols-2 gap-2 md:grid-cols-3 ${xl}`}>{children}</div>
}
