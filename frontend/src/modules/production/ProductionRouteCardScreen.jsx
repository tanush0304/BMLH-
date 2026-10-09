import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import RecordsList from '../../components/RecordsList'
import JobRouteCardSheet from '../../components/JobRouteCardSheet'
import { listProductionPlans } from '../../data/queries/productionPlanning'

const LIST_COLUMNS = [
  { key: 'jc_no', label: 'JC No' },
  { key: 'prd_no', label: 'PRD No' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'part_drawing_reference_number', label: 'Part Drawing Number' },
  { key: 'planned_date', label: 'Planned Date' },
]

/** Generated Job Route Cards (one per PRD, created on Production Planning
 * submit). Read-only -- clicking a card opens the full sheet. */
export default function ProductionRouteCardScreen() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [viewedPrd, setViewedPrd] = useState(null)

  useEffect(() => {
    listProductionPlans()
      .then(setCards)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = cards.filter(
    (c) =>
      !q ||
      [c.jc_no, c.prd_no, c.part_serial_number, c.part_name].some((v) => String(v ?? '').toLowerCase().includes(q))
  )

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Production Route Card" subtitle="Job Route Card Per PRD | Generated On Planning Submit" />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        {viewedPrd && <JobRouteCardSheet prdNo={viewedPrd} onClose={() => setViewedPrd(null)} />}

        <RecordsList
          title="Job Route Cards"
          columns={LIST_COLUMNS}
          rows={filtered}
          loading={loading}
          error={null}
          rowKey="prd_no"
          selectedKey={viewedPrd}
          onRowClick={(row) => setViewedPrd(row.prd_no)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by JC No / PRD / Part..."
        />
      </div>
    </div>
  )
}
