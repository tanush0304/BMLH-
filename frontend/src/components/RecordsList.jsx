import { useState } from 'react'
import { List, Search, ChevronDown, ChevronUp } from 'lucide-react'
import StatusPill from './StatusPill'

const COLLAPSED_ROW_COUNT = 2

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
  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROW_COUNT)
  const hiddenCount = rows.length - visibleRows.length

  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-bmlhsky border-b border-gray-200 px-3 py-1">
        <div className="flex items-center gap-1.5">
          <List size={14} className="text-bmlhnavy" />
          <h2 className="text-xs font-semibold text-bmlhnavy">{title}</h2>
        </div>
        {onSearchChange && (
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="border border-gray-300 rounded pl-7 pr-2.5 py-1 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-bmlhnavy text-left">
              <th className="px-3 py-1 font-semibold w-10">S.No</th>
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-1 font-semibold whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!error && loading && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!error && !loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-gray-400">
                  No records found.
                </td>
              </tr>
            )}
            {!error &&
              !loading &&
              visibleRows.map((row, i) => (
                <tr
                  key={rowKey ? row[rowKey] : i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-bmlhsky/40 ${
                    rowKey && selectedKey === row[rowKey] ? 'bg-bmlhsky/70' : ''
                  }`}
                >
                  <td className="px-3 py-0.5 text-gray-500">{i + 1}</td>
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-0.5 whitespace-nowrap">
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
              ))}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-1 border-t border-gray-200 flex items-center justify-between gap-3">
        <span className="text-[11px] text-gray-500">Total Records: {rows.length}</span>
        {rows.length > COLLAPSED_ROW_COUNT && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-bmlhblue hover:underline"
          >
            {expanded ? (
              <>
                View Less <ChevronUp size={12} />
              </>
            ) : (
              <>
                View More ({hiddenCount}) <ChevronDown size={12} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
