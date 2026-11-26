import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { ChevronDown, FileSpreadsheet, Maximize2, X } from 'lucide-react'
import { toPng } from 'html-to-image'
import { exportToCsv } from '../../utils/exportUtils'
import { EXPORT_EXCLUDE_ATTR, pngFilter, chartFileName, exportedLine, downloadDataUrl } from '../../utils/chartExport'
import { useChartGroup } from './ChartGroup'

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

const EXCLUDE = { [EXPORT_EXCLUDE_ATTR]: '' }

/** Export ▾ (PNG / Excel) -- same look as ReportTable's Export button. Only
 * rendered inside the Expand modal. */
function ExportMenu({ disabled, onPng, onExcel }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const run = (fn) => {
    setOpen(false)
    fn()
  }
  return (
    <div className="relative shrink-0" ref={wrapRef} {...EXCLUDE}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F8A3B] px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-[#18742F] disabled:opacity-50"
      >
        <FileSpreadsheet size={18} /> Export <ChevronDown size={15} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-[#CFE2F8] bg-white shadow-lg">
          <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#E3F0FD]" onClick={() => run(onPng)}>
            PNG
          </button>
          <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#E3F0FD]" onClick={() => run(onExcel)}>
            Excel
          </button>
        </div>
      )}
    </div>
  )
}

/** Titled white card around one Recharts chart; shows loading / empty text
 * instead of an empty plot. Default title row = small blue icon box + bold
 * navy title; `headerColor` instead gives a solid coloured bar with a white
 * title (Daily Machine categories). `children` = a single Recharts chart,
 * or with `raw` any content that sizes itself (e.g. DonutChart).
 * `emptyText` replaces the default empty message.
 *
 * Expand (the only button on the card) opens the chart in a ~90 % viewport
 * modal (full screen on phones, z-70, page scroll locked; Esc / ✕ / backdrop
 * close it). With `exportData` the modal header has Export ▾ next to ✕:
 *   PNG   -- the enlarged chart with title, `filterText` and "Exported
 *            DD-MM-YYYY"; ✕ / Export / the open menu left out (pngFilter)
 *   Excel -- `exportData` { columns: [{ key, label }], rows } as CSV
 *   file  -- "<screen>_<exportKey>_<YYYY-MM-DD>.png / .csv"
 * Expand + Export are disabled while loading or empty; exports use only the
 * rows the chart already has. */
export default function ChartCard({
  title,
  icon: Icon,
  headerColor,
  actions,
  loading,
  empty,
  emptyText = 'No data for this period.',
  height = 240,
  raw = false,
  screen,
  exportKey,
  exportData,
  filterText,
  children,
}) {
  const [expanded, setExpanded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const captureRef = useRef(null)
  const canAct = !loading && !empty
  // Inside a ChartGroup: report state for its "Expand all" (null outside one).
  const group = useChartGroup()
  const groupId = useId()
  const report = group?.report
  const unregister = group?.unregister
  useEffect(() => {
    report?.(groupId, loading ? 'loading' : empty ? 'empty' : 'ready')
  }, [report, groupId, loading, empty])
  useEffect(() => () => unregister?.(groupId), [unregister, groupId])
  const fileBase = chartFileName(screen, exportKey || (typeof title === 'string' ? title : 'Chart'))

  // Esc closes the modal; the page behind it does not scroll while open.
  useEffect(() => {
    if (!expanded) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [expanded])

  function close() {
    setExpanded(false)
    setExportError('')
  }

  function handleExcel() {
    if (!canAct || !exportData) return
    exportToCsv(exportData.columns, exportData.rows, `${fileBase}.csv`)
  }

  async function handlePng() {
    if (!canAct || !captureRef.current) return
    setExportError('')
    setExporting(true) // shows the "Exported ..." line in the capture
    try {
      await new Promise((r) => setTimeout(r, 0)) // let that line render first
      const url = await toPng(captureRef.current, { filter: pngFilter, backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true })
      downloadDataUrl(url, `${fileBase}.png`)
    } catch (e) {
      setExportError(`Could not create the PNG: ${e?.message ?? e}`)
    } finally {
      setExporting(false)
    }
  }

  // big = true (single-chart modal, fills it) or a number (fixed height, group window).
  const body = (big) => (
    <div className={big === true ? 'min-h-0 flex-1 px-2 py-3' : 'px-2 py-3'} style={big === true ? undefined : { height: big || height }}>
      {loading ? (
        <div className="flex h-full items-center justify-center text-[13px] text-slate-400">Loading...</div>
      ) : empty ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-slate-400">{emptyText}</div>
      ) : raw ? (
        children
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      )}
    </div>
  )

  const expandButton = (onDark) => (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      disabled={!canAct}
      title="Expand"
      aria-label="Expand chart"
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border disabled:opacity-50 ${
        onDark ? 'border-white/60 bg-white/15 text-white hover:bg-white/25' : 'border-[#CBDAEE] bg-white text-[#1E5FD0] hover:bg-[#E3F0FD]'
      }`}
    >
      <Maximize2 size={13} />
    </button>
  )

  return (
    <>
      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#D6E4F5] bg-white shadow-[0_2px_6px_rgba(16,60,120,0.08)]">
        {headerColor ? (
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: headerColor }}>
            <h2 className="text-[17px] font-bold text-white">{title}</h2>
            <div className="ml-auto flex items-center gap-2">
              {actions}
              {expandButton(true)}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[#E4EEFA] bg-gradient-to-r from-[#EAF3FE] to-white px-3 py-2">
            {Icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#1E5FD0] text-white">
                <Icon size={17} strokeWidth={2.2} />
              </span>
            )}
            <h2 className="text-[16px] font-bold text-[#0B2A5B]">{title}</h2>
            <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
              {actions}
              {expandButton(false)}
            </div>
          </div>
        )}
        {body(false)}
      </section>

      {group?.open &&
        group.grid &&
        canAct &&
        createPortal(
          <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#D6E4F5] bg-white shadow-[0_2px_6px_rgba(16,60,120,0.08)]" data-testid="chart-group-cell">
            <div className="border-b border-[#E4EEFA] bg-gradient-to-r from-[#EAF3FE] to-white px-3 py-2">
              <h3 className="text-[15px] font-bold text-[#0B2A5B]">{title}</h3>
              {filterText && <p className="text-[12px] text-slate-600">{filterText}</p>}
            </div>
            {body(Math.max(height, 340))}
          </section>,
          group.grid,
        )}

      {expanded &&
        createPortal(
          <div
            role="presentation"
            data-testid="chart-modal-backdrop"
            onMouseDown={(e) => e.target === e.currentTarget && close()}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 sm:p-[5vh]"
          >
            <div
              ref={captureRef}
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === 'string' ? title : 'Chart'}
              className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[90vh] sm:w-[90vw] sm:rounded-xl"
            >
              <div className="flex items-start gap-3 border-b border-[#E4EEFA] bg-gradient-to-r from-[#EAF3FE] to-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[18px] font-bold text-[#0B2A5B]">{title}</h2>
                  {(filterText || exporting) && (
                    <p className="mt-0.5 text-[12px] text-slate-600" data-testid="chart-subline">
                      {filterText}
                      {exporting && <span className="text-slate-500">{filterText ? ' · ' : ''}{exportedLine()}</span>}
                    </p>
                  )}
                </div>
                {actions && <div className="min-w-0" {...EXCLUDE}>{actions}</div>}
                {exportData && <ExportMenu disabled={!canAct || exporting} onPng={handlePng} onExcel={handleExcel} />}
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  title="Close"
                  {...EXCLUDE}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CBDAEE] bg-white text-slate-600 hover:bg-[#E3F0FD]"
                >
                  <X size={18} />
                </button>
              </div>
              {exportError && (
                <p role="alert" className="px-4 py-1.5 text-[12px] text-red-700" {...EXCLUDE}>
                  {exportError}
                </p>
              )}
              {body(true)}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
