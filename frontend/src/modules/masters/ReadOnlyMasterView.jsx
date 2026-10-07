import { useEffect, useMemo, useState } from 'react'
import ActionToolbar from '../../components/ActionToolbar'
import PageHeader from '../../components/PageHeader'
import RecordsList from '../../components/RecordsList'

function formatQuantity(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : value
}

export default function ReadOnlyMasterView({ title, subtitle, loadRows, columns, rowKey }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    loadRows()
      .then((rows) => {
        if (active) setRecords(rows ?? [])
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load records.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadRows])

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return records
    return records.filter((record) =>
      columns.some((column) => String(record[column.key] ?? '').toLowerCase().includes(query))
    )
  }, [columns, records, search])

  const listColumns = useMemo(
    () => columns.map((column) => ({
      key: column.key,
      label: column.label,
      ...(column.numeric ? { render: (row) => formatQuantity(row[column.key]) } : {}),
    })),
    [columns]
  )

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader eyebrow="Masters" title={title} subtitle={subtitle} />
      <ActionToolbar
        showCrudButtons={false}
        showExport={false}
        searchValue={toolbarSearch}
        onSearchChange={setToolbarSearch}
        searchPlaceholder={`Search ${title.toLowerCase()}...`}
        onSearch={() => setSearch(toolbarSearch)}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <RecordsList
          title={`${title} Records`}
          columns={listColumns}
          rows={visibleRecords}
          loading={loading}
          error={error}
          rowKey={rowKey}
        />
      </div>
    </div>
  )
}
