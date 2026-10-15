import { useEffect, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import FormSection, { Field } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import StageTraceTable from '../../components/StageTraceTable'
import RecordsList from '../../components/RecordsList'
import { listOrdersByPrd } from '../../data/queries/customerOrders'
import { listJobOrderStatus } from '../../data/queries/jobOrders'
import { listVendors } from '../../data/queries/vendors'
import { stageLabel } from '../../utils/stageLabel'

// One row per DC -- a stage split across two vendors shows two rows.
const DC_COLUMNS = [
  { key: 'dc_no', label: 'DC No' },
  { key: 'stage_label', label: 'Stage' },
  { key: 'vendor_label', label: 'Vendor' },
  { key: 'qty', label: 'Sent' },
  { key: 'received', label: 'Received' },
  { key: 'balance_qty', label: 'Balance' },
  { key: 'short_qty', label: 'Short' },
  { key: 'receipt_nos', label: 'Receipt No(s)' },
  { key: 'status', label: 'Status', type: 'status' },
]

/** initialPrdNo: pre-selects a PRD (Reports -> Customer Order Status -> View). */
export default function OrderTraceabilityScreen({ initialPrdNo = '' }) {
  const [orders, setOrders] = useState([])
  const [prdNo, setPrdNo] = useState(initialPrdNo)
  const [error, setError] = useState(null)
  const [trace, setTrace] = useState({ columns: [], rows: [] })
  const [dcRows, setDcRows] = useState([])
  const [vendors, setVendors] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const [ords, dcs, vends] = await Promise.all([listOrdersByPrd(), listJobOrderStatus(), listVendors()])
        setOrders(ords)
        setDcRows(dcs)
        setVendors(vends)
      } catch (e) {
        setError(e.message)
      }
    }
    load()
  }, [])

  const stageById = new Map(trace.rows.map((r) => [r.id, r]))
  const prdDcs = dcRows
    .filter((d) => d.prd_no === prdNo)
    .sort((a, b) => String(a.dc_no).localeCompare(String(b.dc_no), undefined, { numeric: true }))
    .map((d) => ({
      ...d,
      stage_label: stageById.get(d.stage_id) ? stageLabel(stageById.get(d.stage_id)) : d.job_work_code,
      vendor_label: vendors.find((v) => v.vendor_id === d.vendor_id)?.vendor_name ?? d.vendor_id,
      received: Number(d.qty_received ?? 0),
      // Nothing more comes back on a closed DC; its shortfall is in Short.
      balance_qty: d.is_open ? Number(d.balance_qty ?? 0) : 0,
      receipt_nos: d.receipt_nos ?? '—',
    }))

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
        {prdNo && prdDcs.length > 0 && <RecordsList title={`Jobwork DCs for ${prdNo}`} columns={DC_COLUMNS} rows={prdDcs} rowKey="dc_no" />}
      </div>
    </div>
  )
}
