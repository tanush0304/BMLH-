import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageDown, Maximize2, X } from 'lucide-react'
import { toPng } from 'html-to-image'
import { pngFilter, chartFileName, exportedLine, downloadDataUrl } from '../../utils/chartExport'

const ChartGroupContext = createContext(null)

/** The ChartGroup around a ChartCard (null outside one). */
export function useChartGroup() {
  return useContext(ChartGroupContext)
}

/**
 * Wraps the charts of one report screen and adds ONE "Expand all" button
 * above them (right). Expand all opens a ~90 % viewport window with every
 * chart of the screen that has data (loading / empty ones left out), one
 * below the other in a single column at every width, each with its own
 * title + filter line. Inside the window only: "Export PNG" = one image of
 * the screen title, every chart and "Exported DD-MM-YYYY" ->
 * "<screen>_All_charts_<YYYY-MM-DD>.png". PNG only (no Excel for the group).
 *
 * Each ChartCard inside reports its state (useChartGroup) and, while the
 * window is open, portals its own full-width copy into the window's grid.
 * The per-chart Expand / Export behaviour of ChartCard is unchanged.
 */
export default function ChartGroup({ title, screen, children }) {
  const [open, setOpen] = useState(false)
  const [grid, setGrid] = useState(null)
  const [status, setStatus] = useState({}) // chart id -> 'loading' | 'empty' | 'ready'
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const captureRef = useRef(null)

  const report = useCallback((id, s) => setStatus((p) => (p[id] === s ? p : { ...p, [id]: s })), [])
  const unregister = useCallback(
    (id) =>
      setStatus((p) => {
        if (!(id in p)) return p
        const next = { ...p }
        delete next[id]
        return next
      }),
    [],
  )
  const ctx = useMemo(() => ({ open, grid, report, unregister }), [open, grid, report, unregister])

  const states = Object.values(status)
  const anyLoading = states.includes('loading')
  const ready = states.filter((s) => s === 'ready').length
  const canAct = !anyLoading && ready > 0

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  function close() {
    setOpen(false)
    setExportError('')
  }

  async function handlePng() {
    if (!canAct || !captureRef.current) return
    setExportError('')
    setExporting(true) // shows the "Exported ..." line in the capture
    try {
      await new Promise((r) => setTimeout(r, 0))
      const url = await toPng(captureRef.current, { filter: pngFilter, backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true })
      downloadDataUrl(url, `${chartFileName(screen, 'All charts')}.png`)
    } catch (e) {
      setExportError(`Could not create the PNG: ${e?.message ?? e}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <ChartGroupContext.Provider value={ctx}>
      <div className="space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!canAct}
            title="Expand all charts"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#CBDAEE] bg-white px-3 text-[13px] font-semibold text-[#1E5FD0] shadow-sm hover:bg-[#E3F0FD] disabled:opacity-50"
          >
            <Maximize2 size={14} /> Expand all
          </button>
        </div>
        {children}
      </div>

      {open &&
        createPortal(
          <div
            role="presentation"
            data-testid="chart-group-backdrop"
            onMouseDown={(e) => e.target === e.currentTarget && close()}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 sm:p-[5vh]"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${title} – all charts`}
              className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[90vh] sm:w-[90vw] sm:rounded-xl"
            >
              <div className="flex items-center gap-3 border-b border-[#E4EEFA] bg-gradient-to-r from-[#EAF3FE] to-white px-4 py-3">
                <h2 className="min-w-0 flex-1 text-[18px] font-bold text-[#0B2A5B]">{title} – All charts</h2>
                <button
                  type="button"
                  onClick={handlePng}
                  disabled={!canAct || exporting}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#1F8A3B] px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-[#18742F] disabled:opacity-50"
                >
                  <ImageDown size={16} /> Export PNG
                </button>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  title="Close"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CBDAEE] bg-white text-slate-600 hover:bg-[#E3F0FD]"
                >
                  <X size={18} />
                </button>
              </div>
              {exportError && (
                <p role="alert" className="px-4 py-1.5 text-[12px] text-red-700">
                  {exportError}
                </p>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F8FD]">
                {/* captured for the PNG: its full height, not just the visible part */}
                <div ref={captureRef} className="bg-[#F4F8FD] p-3" data-testid="chart-group-capture">
                  <div className="mb-2 px-1">
                    <p className="text-[16px] font-bold text-[#0B2A5B]">{title}</p>
                    {exporting && <p className="text-[12px] text-slate-500">{exportedLine()}</p>}
                  </div>
                  <div ref={setGrid} className="grid grid-cols-1 gap-3" data-testid="chart-group-grid" />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ChartGroupContext.Provider>
  )
}
