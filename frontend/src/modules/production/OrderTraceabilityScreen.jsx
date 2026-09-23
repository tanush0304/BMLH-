import { useEffect, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { getStageAggregatesForPrd } from '../../data/queries/productionLogs'
import { computeStageAvailability } from '../../utils/calculations'

const COLUMNS = [
  { key: 'seq', label: 'Seq' },
  { key: 'operation', label: 'Operation' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'actual_output', label: 'Actual Output So Far' },
  { key: 'available_qty', label: 'Available to Feed Next Stage' },
]

export default function OrderTraceabilityScreen() {
  const [orders, setOrders] = useState([])
  const [prdNo, setPrdNo] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        setOrders(await listCustomerOrders())
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSelectPrd(e) {
    const prd = e.target.value
    setPrdNo(prd)
    setRows([])
    if (!prd) return
    setLoading(true)
    setError(null)
    try {
      const order = orders.find((o) => o.prd_no === prd)
      const [stages, aggregates] = await Promise.all([getStagesForPrd(prd), getStageAggregatesForPrd(prd)])
      const availability = computeStageAvailability(stages, order?.order_qty ?? 0, aggregates)
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
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Order Traceability" subtitle="Stage-by-Stage Progress for One Production Order" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={SearchIcon} title="1. Select Order" columns={2}>
          <Field label="Production Order (PRD No)">
            <SelectInput value={prdNo} onChange={handleSelectPrd} options={orders.map((o) => o.prd_no)} />
          </Field>
        </FormSection>

        {prdNo && (
          <RecordsList title={`Stages for ${prdNo}`} columns={COLUMNS} rows={rows} loading={loading} rowKey="id" />
        )}
      </div>
    </div>
  )
}
