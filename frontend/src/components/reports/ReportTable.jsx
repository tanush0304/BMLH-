import { useMemo, useState } from 'react'
import { List, Search, Printer, ChevronDown } from 'lucide-react'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { searchRows } from '../../utils/reportAggregates'

/**
 * Report detail table: S.No, all rows (no collapse), one search box, optional
 * totals row, per-cell colour, Print ▾ (Excel / PDF) of the filtered rows.
 *   columns: [{ key, label, align?: 'right', format?(value, row) -> string,
 *               cellClass?(value, row) -> className }]
 *   searchKeys: row keys the search box matches.
 *   groupHeaders: optional [{ label, span }] row above the column labels
 *     (spans cover the columns after S.No, in order).
 *   showSerial: false hides S.No (e.g. when the first column is a date).
 * Exports use the same formatted text the table shows.
 */
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
  const dataCols = columns.map((c, i) => ({ key: c.key, label: groupOf[i] ? `${groupOf[i]} – ${c.label}` : c.label }))
  const exportCols = showSerial ? [{ key: 'sno', label: 'S.No' }, ...dataCols] : dataCols

  const alignClass = (col) => (col.align === 'right' ? 'text-right' : 'text-left')

  return (
    <section className="overflow-hidden rounded-2xl border border-[#CFE2F8] bg-white shadow-[0_2px_8px_rgba(16,60,120,0.06)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#CFE2F8] bg-[#E3F0FD] px-4 py-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#0A4CB0]">
          <List size={17} strokeWidth={2.2} className="text-[#1669E0]" />
          {title}
        </h2>
        <span className="ml-auto text-[12px] text-slate-500">
          {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
        </span>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? 'Search in list...'}
            className="h-8 w-full rounded-lg border border-[#CBDAEE] bg-white pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#1669E0] focus:outline-none focus:ring-2 focus:ring-[#1669E0]/20"
          />
        </div>
        <div className="relative" onMouseLeave={() => setPrintOpen(false)}>
          <button
            type="button"
            onClick={() => setPrintOpen((v) => !v)}
            disabled={loading || filtered.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 text-[13px] font-semibold text-white hover:bg-[#12893E] disabled:opacity-50"
          >
            <Printer size={15} /> Print <ChevronDown size={14} />
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
              <tr className="bg-[#12305F] text-white">
                {showSerial && <th className="border-b border-white/20" />}
                {groupHeaders.map((g, i) => (
                  <th key={i} colSpan={g.span} className="whitespace-nowrap border-b border-l border-white/20 px-3 py-1.5 text-center font-semibold">
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr className="bg-[#12305F] text-white">
              {showSerial && <th className="w-12 whitespace-nowrap px-3 py-2 text-left font-semibold">S.No</th>}
              {columns.map((col) => (
                <th key={col.key} className={`whitespace-nowrap px-3 py-2 font-semibold ${alignClass(col)}`}>
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
                  {showSerial && <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>}
                  {columns.map((col) => (
                    <td key={col.key} className={`whitespace-nowrap px-3 py-1.5 text-slate-800 ${alignClass(col)} ${col.cellClass?.(row[col.key], row) ?? ''}`}>
                      {show(col, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {totalsRow && !loading && !error && filtered.length > 0 && (
            <tfoot>
              <tr className="bg-[#E3F0FD] font-semibold text-[#0A4CB0]">
                {showSerial && <td className="px-3 py-2" />}
                {columns.map((col, i) => (
                  <td key={col.key} className={`whitespace-nowrap px-3 py-2 ${alignClass(col)}`}>
                    {i === 0 ? 'Total' : totalsRow[col.key] == null ? '' : show(col, totalsRow)}
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
