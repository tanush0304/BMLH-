import { Children, createContext, isValidElement, useContext, useState } from 'react'
import { Bar, Cell, Line } from 'recharts'
import { BarChart3, LineChart as LineIcon } from 'lucide-react'

// Bar / Line switch for every chart on a report page. ReportsModule wraps a
// chart page in <ChartTypeProvider> (fresh per page, default Bar); the page's
// filter bar (ReportFilterBar / ReportDayBar) shows <ChartTypeToggle />; each
// chart's main series is a <Series>, inside a ComposedChart so it can render
// as either. Donuts and secondary overlay lines (efficiency %, yield %,
// closing stock) are plain <Line>s and do not switch.
export const CHART_TYPES = [
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'line', label: 'Line', icon: LineIcon },
]

const ChartTypeContext = createContext(null)

export function ChartTypeProvider({ initial = 'bar', children }) {
  const [type, setType] = useState(initial)
  return <ChartTypeContext.Provider value={{ type, setType }}>{children}</ChartTypeContext.Provider>
}

/** 'bar' | 'line' -- 'bar' outside a provider. */
export function useChartType() {
  return useContext(ChartTypeContext)?.type ?? 'bar'
}

/** Segmented Bar | Line control; renders nothing outside a provider. */
export default function ChartTypeToggle() {
  const ctx = useContext(ChartTypeContext)
  if (!ctx) return null
  return (
    <div role="group" aria-label="Chart type" className="inline-flex h-9 overflow-hidden rounded-lg border border-[#CBDAEE] bg-white">
      {CHART_TYPES.map(({ value, label, icon: Icon }) => {
        const active = ctx.type === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => ctx.setType(value)}
            className={`inline-flex items-center gap-1.5 px-3 text-[13px] font-medium ${
              active ? 'bg-[#1669E0] text-white' : 'text-slate-600 hover:bg-[#E6F0FD]'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One chart series as a real <Bar> or <Line> element (a plain function, not
 * a wrapper component, so Recharts sees its own element types):
 *   {series(chartType, { key, dataKey, name, color, stackId, children })}
 * `color` is the bar fill / line stroke. Bar-only props (stackId, per-point
 * <Cell>s) are dropped for a line, so a stacked or multi-coloured bar chart
 * becomes plain lines. LabelList children work for both.
 */
export function series(type, { key, color, stackId, children, ...props }) {
  if (type === 'line') {
    const kept = Children.toArray(children).filter((c) => !(isValidElement(c) && c.type === Cell))
    return (
      <Line key={key} {...props} stroke={color ?? '#1669E0'} strokeWidth={2.5} dot={{ r: 3 }}>
        {kept}
      </Line>
    )
  }
  return (
    <Bar key={key} {...props} fill={color} stackId={stackId}>
      {children}
    </Bar>
  )
}
