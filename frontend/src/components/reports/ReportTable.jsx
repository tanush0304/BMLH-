import { useMemo, useState } from 'react'
import { List, Search, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { searchRows } from '../../utils/reportAggregates'

/**
 * Report detail table: S.No, all rows (no collapse), one search box, optional
 * totals row, per-cell colour, Export ▾ (Excel / PDF) of the filtered rows.
 *   columns: [{ key, label, align?: 'right', format?(value, row) -> string,
 *               cellClass?(value, row) -> className,
 *               bar?(row) -> colour: draws a 0-100 progress bar before the value,
 *               render?(row) -> node: on-screen cell only (exports use format / value),
 *               noExport?: true -> left out of Excel / PDF (e.g. an action button) }]
 *   searchKeys: row keys the search box matches.
 *   groupHeaders: optional [{ label, span }] row above the column labels
 *     (spans cover the columns after S.No, in order).
 *   showSerial: false hides S.No (e.g. when the first column is a date).
 * Exports use the same formatted text the table shows.
 */
/** Progress bar (0-100 %) + coloured value, e.g. Downtime %. Scaled x4 so
 * small percentages stay visible; capped at full width. */
function BarCell({ value, color, text }) {
  const width = Math.min(100, Math.max(0, Number(value) || 0) * 4)
  return (
    <span className="flex items-center gap-3">
      <span className="h-4 flex-1 overflow-hidden rounded-sm" style={{ backgroundColor: `${color}26` }}>
        <span className="block h-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </span>
      <span className="w-16 text-right font-bold" style={{ color }}>{text}</span>
    </span>
  )
}

export default function ReportTable({ title, columns, rows, totalsRow, groupHeaders, showSerial = true, loading, error, rowKey, searchKeys = [], searchPlaceholder, exportTitle, exportName }) {
  const [search, setSearch] = useState('')
  const [printOpen, setPrintOpen] = useState(false)
  const filtered = useMemo(() => searchRows(rows, search, searchKeys), [rows, search, searchKeys])

  const show = (col, row) => {
    const v = row[col.key]
    if (col.format) return col.format(v, row)
    return v ?? '—'
  }

  // Export the shown text, but blank instead of the "—" placeholder.
  const exportText = (col, row) => {
    const text = show(col, row)
    return text === '—' ? '' : text
  }

  function exportRows() {
    const flat = filtered.map((row, i) => ({ sno: i + 1, ...Object.fromEntries(columns.map((c) => [c.key, exportText(c, row)])) }))
    if (totalsRow) flat.push({ sno: '', ...Object.fromEntries(columns.map((c) => [c.key, totalsRow[c.key] == null ? '' : exportText(c, totalsRow)])) })
    return flat
  }
  // Group headers are folded into the export labels ("CNC – Production").
  const groupOf = []
  for (const g of groupHeaders ?? []) for (let k = 0; k < g.span; k++) groupOf.push(g.label)
  const dataCols = columns
    .map((c, i) => ({ key: c.key, label: groupOf[i] ? `${groupOf[i]} – ${c.label}` : c.label, noExport: c.noExport }))
    .filter((c) => !c.noExport)
  const exportCols = showSerial ? [{ key: 'sno', label: 'S.No' }, ...dataCols] : dataCols

  const alignClass = (col) => (col.align === 'right' ? 'text-right' : 'text-left')

  return (
    <section className="overflow-hidden rounded-xl border border-[#D6E4F5] bg-white shadow-[0_2px_6px_rgba(16,60,120,0.08)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-gradient-to-r from-[#EAF3FE] to-white px-3 py-2">
        <h2 className="flex items-center gap-2.5 text-[17px] font-bold text-[#0B2A5B]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#1E5FD0] text-white">
            <List size={20} strokeWidth={2.4} />
          </span>
          {title}
        </h2>
        <span className="text-[12px] text-slate-500">
          {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
        </span>
        <div className="relative ml-auto w-full sm:w-80">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? 'Search in list...'}
            className="h-9 w-full rounded-lg border border-[#CBDAEE] bg-white pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#1669E0] focus:outline-none focus:ring-2 focus:ring-[#1669E0]/20"
          />
        </div>
        <div className="relative" onMouseLeave={() => setPrintOpen(false)}>
          <button
            type="button"
            onClick={() => setPrintOpen((v) => !v)}
            disabled={loading || filtered.length === 0}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F8A3B] px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-[#18742F] disabled:opacity-50"
          >
            <FileSpreadsheet size={18} /> Export <ChevronDown size={15} />
          </button>
          {printOpen && (
            <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-[#CFE2F8] bg-white shadow-lg">
              <button type="button" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#E3F0FD]" onClick={() => { setPrintOpen(false); exportToCsv(exportCols, exportRows(), `${exportName}.csv`) }}>
                Excel
              </button>
              <button type="button" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#E3F0FD]" onClick={() => { setPrintOpen(false); exportToPdf(exportCols, exportRows(), exportTitle, exportName) }}>
                PDF
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10">
            {groupHeaders && (
              <tr className="bg-[#1450B4] text-white">
                {showSerial && <th className="border-b border-white/20" />}
                {groupHeaders.map((g, i) => (
                  <th key={i} colSpan={g.span} className="whitespace-nowrap border-b border-l border-white/20 px-3 py-1.5 text-center font-semibold">
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr className="bg-[#1450B4] text-white">
              {showSerial && <th className="w-14 whitespace-nowrap px-3 py-2 text-center font-semibold">Sl No</th>}
              {columns.map((col) => (
                <th key={col.key} className="whitespace-nowrap border-l border-white/15 px-3 py-2 text-center font-semibold">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr><td colSpan={columns.length + (showSerial ? 1 : 0)} className="px-3 py-5 text-center text-red-600">{error}</td></tr>
            ) : loading ? (
              <tr><td colSpan={columns.length + (showSerial ? 1 : 0)} className="px-3 py-5 text-center text-slate-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={columns.length + (showSerial ? 1 : 0)} className="px-3 py-5 text-center text-slate-400">No records found.</td></tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={rowKey ? row[rowKey] : i} className="border-b border-[#E4EEFA] even:bg-[#F7FAFE] hover:bg-sky-50">
                  {showSerial && <td className="px-3 py-1.5 text-center text-slate-600">{i + 1}</td>}
                  {columns.map((col) => (
                    <td key={col.key} className={`whitespace-nowrap px-3 py-1.5 text-slate-800 ${alignClass(col)} ${col.cellClass?.(row[col.key], row) ?? ''}`}>
                      {col.render ? col.render(row) : col.bar ? <BarCell value={row[col.key]} color={col.bar(row)} text={show(col, row)} /> : show(col, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {totalsRow && !loading && !error && filtered.length > 0 && (
            <tfoot>
              <tr className="bg-[#DCEBFD] font-bold text-[#0B2A5B]">
                {showSerial && <td className="px-3 py-2" />}
                {columns.map((col, i) => (
                  <td key={col.key} className={`whitespace-nowrap px-3 py-2 ${alignClass(col)}`}>
                    {i === 0 ? 'Total' : totalsRow[col.key] == null ? '' : col.bar ? <BarCell value={totalsRow[col.key]} color={col.bar(totalsRow)} text={show(col, totalsRow)} /> : show(col, totalsRow)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

const BADGE = {
  green: 'bg-green-100 text-green-800 border-green-300',
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  red: 'bg-red-100 text-red-700 border-red-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
}

/** Status badge for report tables; `tones` maps status -> green / amber / red / blue / slate. */
/** `status` picks the colour; `label` (optional) is the text shown. */
export function ReportBadge({ status, tones, label }) {
  return <span className={`inline-block min-w-[78px] rounded border px-2 py-0.5 text-center text-[12px] font-semibold ${BADGE[tones[status]] ?? BADGE.amber}`}>{label ?? status}</span>
}
