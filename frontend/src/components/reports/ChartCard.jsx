import { ResponsiveContainer } from 'recharts'

// Shared series colours (same blues/greens/ambers/reds as the KPI tones).
export const CHART_COLORS = {
  blue: '#1669E0',
  green: '#16A34A',
  orange: '#F08C1A',
  red: '#DC2626',
  purple: '#7C3AED',
  amber: '#EAB308',
  grid: '#E4EEFA',
  axis: '#64748B',
}

export const AXIS_TICK = { fontSize: 11, fill: CHART_COLORS.axis }

/** Titled card around one Recharts chart; shows loading / empty text instead
 * of an empty plot. `children` = a single Recharts chart element. */
export default function ChartCard({ title, icon: Icon, loading, empty, height = 240, children }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#CFE2F8] bg-white shadow-[0_2px_8px_rgba(16,60,120,0.06)]">
      <div className="flex items-center gap-2 border-b border-[#CFE2F8] bg-[#E3F0FD] px-4 py-2">
        {Icon && <Icon size={17} strokeWidth={2.2} className="text-[#1669E0]" />}
        <h2 className="text-[15px] font-semibold text-[#0A4CB0]">{title}</h2>
      </div>
      <div className="px-2 py-3" style={{ height }}>
        {loading ? (
          <div className="flex h-full items-center justify-center text-[13px] text-slate-400">Loading...</div>
        ) : empty ? (
          <div className="flex h-full items-center justify-center text-[13px] text-slate-400">No data for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
