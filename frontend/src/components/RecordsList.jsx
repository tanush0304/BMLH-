import { List, Search } from 'lucide-react'
import StatusPill from './StatusPill'

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
  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-bmlhsky border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <List size={16} className="text-bmlhnavy" />
          <h2 className="text-sm font-semibold text-bmlhnavy">{title}</h2>
        </div>
        {onSearchChange && (
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="border border-gray-300 rounded pl-8 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-bmlhnavy text-left">
              <th className="px-4 py-2 font-semibold w-12">S.No</th>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-2 font-semibold whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!error && loading && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!error && !loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-gray-400">
                  No records found.
                </td>
              </tr>
            )}
            {!error &&
              !loading &&
              rows.map((row, i) => (
                <tr
                  key={rowKey ? row[rowKey] : i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-bmlhsky/40 ${
                    rowKey && selectedKey === row[rowKey] ? 'bg-bmlhsky/70' : ''
                  }`}
                >
                  <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-2 whitespace-nowrap">
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

      <div className="px-4 py-2.5 border-t border-gray-200 text-xs text-gray-500">
        Total Records: {rows.length}
      </div>
    </div>
  )
}
