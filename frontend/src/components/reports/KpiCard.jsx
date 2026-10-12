// Pastel card + solid icon circle per tone (mockup palette: blue, green,
// peach, lavender, pink, mint).
const TONES = {
  blue: { card: 'bg-[#E8F2FE] border-[#C9DFFA]', icon: 'bg-[#1E7BF2]' },
  green: { card: 'bg-[#E7F7EC] border-[#C3EACF]', icon: 'bg-[#22A34A]' },
  orange: { card: 'bg-[#FFF1E2] border-[#F8D9B4]', icon: 'bg-[#F7941D]' },
  purple: { card: 'bg-[#F1EBFD] border-[#DCCDF8]', icon: 'bg-[#7B3FE4]' },
  red: { card: 'bg-[#FDE9EC] border-[#F6C7CF]', icon: 'bg-[#E5243B]' },
  teal: { card: 'bg-[#E3F7F3] border-[#BDEBE1]', icon: 'bg-[#1FBF9F]' },
}

export function formatQty(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })
}

/** "▲ 12%" / "▼ 3.2 pts" line under a KPI. good = whether a rise is good
 * (production) or bad (rejects): colours green/red accordingly. */
function Delta({ delta }) {
  if (!delta || delta.value == null) return <div className="text-right text-[12px] leading-tight text-slate-400"><span className="block text-[17px] font-bold">—</span>{delta?.caption}</div>
  const up = delta.value > 0
  const flat = delta.value === 0
  const good = flat ? null : up === (delta.higherIsBetter ?? true)
  const colour = good == null ? 'text-slate-500' : good ? 'text-green-600' : 'text-red-600'
  return (
    <div className="text-right text-[12px] leading-tight text-slate-600">
      <span className={`block text-[17px] font-bold ${colour}`}>
        {flat ? '■' : up ? '▲' : '▼'} {Math.abs(delta.value).toFixed(1)}{delta.unit ?? '%'}
      </span>
      {delta.caption}
    </div>
  )
}

/** One KPI tile: icon, label, big value + unit, optional sub-line (e.g. "(2.6 %)"),
 * optional delta ({ value, unit, caption, higherIsBetter }) and side content. */
export function KpiCard({ label, value, unit, sub, delta, side, icon: Icon, tone = 'blue', loading }) {
  const t = TONES[tone] ?? TONES.blue
  return (
    <div className={`flex min-h-[96px] flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-[0_2px_6px_rgba(16,60,120,0.08)] ${t.card}`}>
      {Icon && (
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-md ${t.icon}`}>
          <Icon size={28} strokeWidth={2.2} />
        </div>
      )}
      {/* min width so a `side` block wraps under the label instead of overlapping it */}
      <div className={`min-w-0 flex-1 ${side ? 'min-w-[130px]' : ''}`}>
        <div className="text-[14px] font-bold leading-tight text-[#0B2A5B]">{label}</div>
        {/* Value + unit, with the delta pushed right; wraps under when the card is narrow. */}
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-extrabold leading-none text-[#0B2A5B]">{loading ? '—' : value}</span>
            {unit && !loading && <span className="text-[14px] font-medium text-slate-700">{unit}</span>}
          </span>
          {delta && !loading && <Delta delta={delta} />}
        </div>
        {sub && !loading && <div className="mt-0.5 text-[13px] text-slate-700">{sub}</div>}
      </div>
      {side && !loading && <div className="ml-auto shrink-0 pl-2">{side}</div>}
    </div>
  )
}

/** Responsive row of KpiCards (1-2 per row on small screens, all in one row on wide). */
export function KpiCardRow({ children, columns = 6 }) {
  // One row on wide screens; 6 cards need 2xl (>= 1536px) -- at 1280px they wrap 3 + 3.
  const wide = { 4: 'md:grid-cols-2 xl:grid-cols-4', 5: 'md:grid-cols-3 xl:grid-cols-5' }[columns] ?? 'md:grid-cols-3 2xl:grid-cols-6'
  return <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${wide}`}>{children}</div>
}
