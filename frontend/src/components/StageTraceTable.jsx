import { useEffect, useState } from 'react'
import RecordsList from './RecordsList'
import { listCustomerOrders } from '../data/queries/customerOrders'
import { getStagesForPrd } from '../data/queries/routeCards'
import { getStageAggregatesForPrd } from '../data/queries/productionLogs'
import { getWipAggregatesForPrd } from '../data/queries/wip'
import { computeStageAvailability } from '../utils/calculations'

function buildColumns(card) {
  const columns = [
    { key: 'seq', label: 'Seq' },
    { key: 'operation', label: 'Operation' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'actual_output', label: 'Actual Output So Far' },
    { key: 'available_qty', label: 'Available to Feed Next Stage' },
  ]
  if (card) {
    // No of Shifts Planned = cycle_time_min * batch_qty / (shift_hours * 60),
    // the client's own Route Card formula -- derived at display time, never
    // stored, same pattern as available_qty above.
    columns.push({
      key: 'shifts_planned',
      label: 'No of Shifts Planned',
      render: (r) => {
        if (!card.batch_qty || !card.shift_hours || !r.cycle_time_min) return '—'
        return ((r.cycle_time_min * card.batch_qty) / (card.shift_hours * 60)).toFixed(2)
      },
    })
  }
  return columns
}

/** Stage-by-stage progress table for one PRD, extracted from Order Traceability
 * so it can be reused (e.g. Production Planning's "View" action) without a picker.
 * `card` (optional): { batch_qty, shift_hours } -- when given, adds a derived
 * "No of Shifts Planned" column per stage. */
export default function StageTraceTable({ prdNo, title, card }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!prdNo) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [orders, stages, aggregates, wipAggregates] = await Promise.all([
          listCustomerOrders(),
          getStagesForPrd(prdNo),
          getStageAggregatesForPrd(prdNo),
          getWipAggregatesForPrd(prdNo),
        ])
        const order = orders.find((o) => o.prd_no === prdNo)
        const availability = computeStageAvailability(stages, order?.order_qty ?? 0, aggregates, wipAggregates)
        if (cancelled) return
        setRows(
          stages
            .sort((a, b) => a.seq - b.seq)
            .map((s) => ({
              ...s,
              actual_output: aggregates[s.id]?.output ?? (s.type === 'Manual' ? '—' : 0),
              available_qty: availability[s.id],
            }))
        )
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [prdNo])

  return (
    <RecordsList
      title={title ?? `Stages for ${prdNo}`}
      columns={buildColumns(card)}
      rows={rows}
      loading={loading}
      error={error}
      rowKey="id"
    />
  )
}
