import { useEffect, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput } from '../../components/FormSection'
import StageTraceTable from '../../components/StageTraceTable'
import { listCustomerOrders } from '../../data/queries/customerOrders'

export default function OrderTraceabilityScreen() {
  const [orders, setOrders] = useState([])
  const [prdNo, setPrdNo] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        setOrders(await listCustomerOrders())
      } catch (e) {
        setError(e.message)
      }
    }
    load()
  }, [])

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
            <SelectInput value={prdNo} onChange={(e) => setPrdNo(e.target.value)} options={orders.map((o) => o.prd_no)} />
          </Field>
        </FormSection>

        {prdNo && <StageTraceTable prdNo={prdNo} />}
      </div>
    </div>
  )
}
