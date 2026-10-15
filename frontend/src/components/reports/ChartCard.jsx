import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

// Shared series colours (same blues/greens/ambers/reds as the KPI tones).
export const CHART_COLORS = {
  blue: '#1E7BF2',
  green: '#22A34A',
  orange: '#F7941D',
  red: '#E5243B',
  purple: '#7B3FE4',
  amber: '#F5B800',
  grid: '#E4EEFA',
  axis: '#475569',
}

export const AXIS_TICK = { fontSize: 11, fill: CHART_COLORS.axis }

// Machine category colours, assigned in order (categories come from the
// data, so any number works; the palette repeats after the last colour).
export const CATEGORY_PALETTE = [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.purple, CHART_COLORS.red, '#0F9F8F', '#C2185B', '#64748B']
// Efficiency line colour per bar colour -- a contrasting palette entry.
export const categoryColor = (index) => CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]
export const categoryLineColor = (index) => CATEGORY_PALETTE[(index + 1) % CATEGORY_PALETTE.length]

/**
 * Donut with the total in the centre and a legend on the right (dot, label,
 * bold value / %), as in the mockups. Use inside <ChartCard raw>.
 *   data:   [{ key, label, value, color, detail? }]   (value > 0 slices only are drawn)
 *   centre: { caption, total, unit }
 *   legendValue(item, sharePct) -> text shown in bold under each label
 *   tooltip(item) -> text
 */
export function DonutChart({ data, centre, legendValue, tooltip }) {
  const total = data.reduce((a, d) => a + (d.value > 0 ? d.value : 0), 0)
  const slices = data.filter((d) => d.value > 0)
  const share = (d) => (total > 0 ? Math.round((1000 * d.value) / total) / 10 : 0)
  return (
    <div className="flex h-full items-center gap-2">
      <div className="relative h-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="92%" paddingAngle={1} startAngle={90} endAngle={-270}>
              {slices.map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v, name, item) => [tooltip ? tooltip(item.payload) : v, name]} />
          </PieChart>
        </ResponsiveContainer>
        {centre && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
            <span className="text-[13px] text-slate-700">{centre.caption}</span>
            <span className="text-[22px] font-extrabold text-[#0B2A5B]">{centre.total}</span>
            {centre.unit && <span className="text-[12px] text-slate-700">{centre.unit}</span>}
          </div>
        )}
      </div>
      {/* Two-line items as in the mockup; one line each when there are many. */}
      <ul className={`max-h-full shrink-0 overflow-y-auto pr-2 text-[13px] ${data.length > 5 ? 'space-y-1' : 'space-y-2.5'}`}>
        {data.map((d) => {
          const value = legendValue ? legendValue(d, share(d)) : `${share(d)}%`
          return (
            <li key={d.key} className="flex items-start gap-2">
              <span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              {data.length > 5 ? (
                <span className="flex min-w-[150px] justify-between gap-3 leading-tight">
                  <span className="text-slate-700">{d.label}</span>
                  <span className="font-bold text-[#0B2A5B]">{value}</span>
                </span>
              ) : (
                <span className="leading-tight">
                  <span className="block text-slate-700">{d.label}</span>
                  <span className="block text-[16px] font-bold text-[#0B2A5B]">{value}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Titled white card around one Recharts chart; shows loading / empty text
 * instead of an empty plot. Default title row = small blue icon box + bold
 * navy title; `headerColor` instead gives a solid coloured bar with a white
 * title (Daily Machine categories). `children` = a single Recharts chart,
 * or with `raw` any content that sizes itself (e.g. DonutChart). */
export default function ChartCard({ title, icon: Icon, headerColor, actions, loading, empty, height = 240, raw = false, children }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#D6E4F5] bg-white shadow-[0_2px_6px_rgba(16,60,120,0.08)]">
      {headerColor ? (
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: headerColor }}>
          <h2 className="text-[17px] font-bold text-white">{title}</h2>
          {actions && <div className="ml-auto">{actions}</div>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[#E4EEFA] bg-gradient-to-r from-[#EAF3FE] to-white px-3 py-2">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#1E5FD0] text-white">
              <Icon size={17} strokeWidth={2.2} />
            </span>
          )}
          <h2 className="text-[16px] font-bold text-[#0B2A5B]">{title}</h2>
          {actions && <div className="ml-auto min-w-0 max-w-full">{actions}</div>}
        </div>
      )}
      <div className="px-2 py-3" style={{ height }}>
        {loading ? (
          <div className="flex h-full items-center justify-center text-[13px] text-slate-400">Loading...</div>
        ) : empty ? (
          <div className="flex h-full items-center justify-center text-[13px] text-slate-400">No data for this period.</div>
        ) : raw ? (
          children
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
