import { useEffect, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import FormSection, { Field } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import StageTraceTable from '../../components/StageTraceTable'
import { listCustomerOrders } from '../../data/queries/customerOrders'

export default function OrderTraceabilityScreen() {
  const [orders, setOrders] = useState([])
  const [prdNo, setPrdNo] = useState('')
  const [error, setError] = useState(null)
  const [trace, setTrace] = useState({ columns: [], rows: [] })

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
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Order Traceability" subtitle="Stage-by-Stage Progress for One Production Order" />
      <ActionToolbar
        showCrudButtons={false}
        showExport={Boolean(prdNo)}
        onExportExcel={() => exportToCsv(trace.columns, trace.rows, `order_trace_${prdNo}.csv`)}
        onExportPdf={() => exportToPdf(trace.columns, trace.rows, `Order Traceability -- ${prdNo}`, `order_trace_${prdNo}`)}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={SearchIcon} title="1. Select Order" subtitle="Pick an order to trace" columns={2}>
          <Field label="Production Order (PRD No)">
            <SearchableSelect value={prdNo} onChange={(e) => setPrdNo(e.target.value)} options={orders.map((o) => o.prd_no)} />
          </Field>
        </FormSection>

        {prdNo && <StageTraceTable prdNo={prdNo} onRowsChange={(columns, rows) => setTrace({ columns, rows })} />}
      </div>
    </div>
  )
}
