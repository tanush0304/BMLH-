import { useMemo, useState } from 'react'
import { List, Search, ChevronDown, ChevronUp, ArrowDownUp, ArrowDown, ArrowUp } from 'lucide-react'
import StatusPill from './StatusPill'
import { isQuantityColumn, NUM_HIGHLIGHT_CLASS } from '../utils/numberHighlight'

const COLLAPSED_ROW_COUNT = 2

// Display-only sort: compares what the cell shows (numbers numerically,
// everything else as text). Columns with a custom render that returns markup
// sort by their raw row value.
function sortValue(row, col) {
  const raw = row[col.key]
  if (raw !== undefined && raw !== null && typeof raw !== 'object') return raw
  if (col.render) {
    const shown = col.render(row)
    if (typeof shown === 'string' || typeof shown === 'number') return shown
  }
  return raw ?? ''
}

function compareValues(a, b) {
  const an = Number(a)
  const bn = Number(b)
  if (a !== '' && b !== '' && !Number.isNaN(an) && !Number.isNaN(bn)) return an - bn
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function sortRows(rows, columns, sort) {
  if (!sort) return rows
  const col = columns.find((c) => c.key === sort.key)
  if (!col) return rows
  return [...rows].sort((a, b) => sort.dir * compareValues(sortValue(a, col), sortValue(b, col)))
}

export default function RecordsList({
  title = 'Records',
  columns,
  rows,
  loading,
  error,
  selectedKey,
  rowKey,
  onRowClick,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search in list...',
}) {
  const [expanded, setExpanded] = useState(false)
  const [sort, setSort] = useState(null) // { key, dir: 1 | -1 }

  const sortedRows = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort])

  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, COLLAPSED_ROW_COUNT)
  const hiddenCount = rows.length - visibleRows.length

  function toggleSort(key) {
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null))
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#CFE2F8] bg-white shadow-[0_2px_8px_rgba(16,60,120,0.06)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#CFE2F8] bg-[#E3F0FD] px-4 py-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#0A4CB0]">
          <List size={17} strokeWidth={2.2} className="text-[#1669E0]" />
          {title}
        </h2>
        <span className="ml-auto text-[12px] text-slate-500">
          {rows.length} {rows.length === 1 ? 'record' : 'records'}
        </span>
        {onSearchChange && (
          <div className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-lg border border-[#CBDAEE] bg-white pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#1669E0] focus:outline-none focus:ring-2 focus:ring-[#1669E0]/20"
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#F3F8FE] text-left text-[#0A4CB0]">
              <th className="w-12 whitespace-nowrap border-b border-[#CFE2F8] px-3 py-2 font-semibold">S.No</th>
              {columns.map((col) => {
                const active = sort?.key === col.key
                const SortIcon = !active ? ArrowDownUp : sort.dir === 1 ? ArrowUp : ArrowDown
                return (
                  <th
                    key={col.key}
                    aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    className="whitespace-nowrap border-b border-[#CFE2F8] p-0 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex w-full items-center gap-1 px-3 py-2 text-left hover:bg-[#E3F0FD] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1669E0]"
                    >
                      {col.label}
                      <SortIcon size={12} className={active ? 'text-[#1669E0]' : 'opacity-40'} aria-hidden="true" />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-5 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!error && loading && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-5 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {!error && !loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-5 text-center text-slate-400">
                  No records found.
                </td>
              </tr>
            )}
            {!error &&
              !loading &&
              visibleRows.map((row, i) => {
                const selected = rowKey && selectedKey === row[rowKey]
                return (
                  <tr
                    key={rowKey ? row[rowKey] : i}
                    onClick={() => onRowClick?.(row)}
                    className={`cursor-pointer border-b border-[#E4EEFA] ${
                      selected
                        ? 'bg-[#E3F0FD] outline outline-2 -outline-offset-2 outline-[#1669E0]'
                        : 'even:bg-[#F7FAFE] hover:bg-sky-50'
                    }`}
                  >
                    <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                    {columns.map((col) => (
                      <td key={col.key} className={`whitespace-nowrap px-3 py-1.5 ${isQuantityColumn(col) ? NUM_HIGHLIGHT_CLASS : 'text-slate-800'}`}>
                        {col.type === 'status' ? (
                          <StatusPill status={row[col.key]} />
                        ) : col.render ? (
                          col.render(row)
                        ) : (
                          row[col.key] ?? '—'
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {rows.length > COLLAPSED_ROW_COUNT && (
        <div className="flex items-center justify-end gap-3 px-4 py-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1669E0] hover:underline"
          >
            {expanded ? (
              <>
                View Less <ChevronUp size={13} />
              </>
            ) : (
              <>
                View More ({hiddenCount}) <ChevronDown size={13} />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  )
}
