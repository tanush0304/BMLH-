import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import RecordsList from '../../components/RecordsList'
import { listRouteCards, getStagesForPrd } from '../../data/queries/routeCards'

const CARD_COLUMNS = [
  { key: 'prd_no', label: 'PRD No' },
  { key: 'batch_qty', label: 'Batch Qty' },
  { key: 'shift_hours', label: 'Shift Hours' },
  { key: 'planned_date', label: 'Planned Date' },
]

// No of Shifts Planned = cycle_time_min * batch_qty / (shift_hours * 60), the
// client's own Route Card formula -- derived at display time from the card's
// batch_qty/shift_hours, never stored, same pattern as every other computed
// figure in this app (see StageTraceTable's available_qty, for instance).
function shiftsPlannedColumns(card) {
  return [
    { key: 'seq', label: 'Seq' },
    { key: 'operation', label: 'Operation' },
    { key: 'type', label: 'Type' },
    { key: 'machine_id', label: 'Machine ID' },
    { key: 'job_work_code', label: 'Job Work Code' },
    { key: 'cycle_time_min', label: 'Cycle Time (min)' },
    {
      key: 'shifts_planned',
      label: 'No of Shifts Planned',
      render: (r) => {
        if (!card?.batch_qty || !card?.shift_hours || !r.cycle_time_min) return '—'
        const shifts = (r.cycle_time_min * card.batch_qty) / (card.shift_hours * 60)
        return shifts.toFixed(2)
      },
    },
    { key: 'status', label: 'Status', type: 'status' },
  ]
}

/** Route card generation now lives in Production > Production Planning, whose
 * Submit is what creates the card and snapshots its stages. This screen is a
 * read-only viewer of what's already been generated. */
export default function RouteCardScreen() {
  const [routeCards, setRouteCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [viewedCard, setViewedCard] = useState(null)
  const [stages, setStages] = useState([])
  const [stagesLoading, setStagesLoading] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        setRouteCards(await listRouteCards())
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleViewCard(row) {
    setViewedCard(row)
    setStagesLoading(true)
    try {
      setStages(await getStagesForPrd(row.prd_no))
    } catch (e) {
      setError(e.message)
    } finally {
      setStagesLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        title="Production Route Cards"
        subtitle="Generated From Production Planning  |  Frozen Snapshot Per Order"
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>
        )}

        <RecordsList
          title="Route Cards"
          columns={CARD_COLUMNS}
          rows={routeCards}
          loading={loading}
          error={null}
          rowKey="prd_no"
          selectedKey={viewedCard?.prd_no}
          onRowClick={handleViewCard}
        />

        {viewedCard && (
          <RecordsList
            title={`Stages for ${viewedCard.prd_no}`}
            columns={shiftsPlannedColumns(viewedCard)}
            rows={stages}
            loading={stagesLoading}
            error={null}
            rowKey="id"
          />
        )}
      </div>
    </div>
  )
}
