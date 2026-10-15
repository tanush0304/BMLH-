import { useEffect, useState } from 'react'
import { toDateOrNull } from '../../utils/numericFields'
import { Truck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import FormSection, { Field, TextInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import usePartForPrd from '../../utils/usePartForPrd'
import RecordsList from '../../components/RecordsList'
import StatusPill from '../../components/StatusPill'
import { listOrdersByPrd } from '../../data/queries/customerOrders'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { getStageAggregatesForPrd } from '../../data/queries/productionLogs'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import {
  listPendingOutsourcedStagesForPrd,
  listVendorsForJobWorkCode,
  createDispatch,
  generateNextDcNo,
  listJobOrderStatus,
  listJobworkStageStatus,
} from '../../data/queries/jobOrders'
import { getWipAggregatesForPrd } from '../../data/queries/wip'
import { listVendors } from '../../data/queries/vendors'
import { computeStageAvailability } from '../../utils/calculations'
import { stageLabel } from '../../utils/stageLabel'
import { qtyOverLimitError } from '../../utils/qtyLimits'
import { dcBalance } from '../../utils/jobwork'
import { stageBackText } from '../../utils/reportOrders'

const LIST_COLUMNS = [
  { key: 'dc_no', label: 'DC No' },
  { key: 'prd_no', label: 'PRD No' },
  { key: 'job_work_code', label: 'Job Work' },
  { key: 'vendor_label', label: 'Vendor' },
  { key: 'qty', label: 'Qty' },
  { key: 'dispatch_date', label: 'Dispatch Date' },
  { key: 'expected_receipt_date', label: 'Expected Receipt' },
  { key: 'progress', label: 'Received / Sent' },
  { key: 'status', label: 'Status', type: 'status' },
]

function vendorLabel(vendorId, vendors) {
  const name = vendors.find((v) => v.vendor_id === vendorId)?.vendor_name
  return name ? `${vendorId} – ${name}` : vendorId ?? ''
}

export default function JobOrderDispatchScreen() {
  const [orders, setOrders] = useState([])
  const [jobWorkTypes, setJobWorkTypes] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [prdNo, setPrdNo] = useState('')
  const part = usePartForPrd(prdNo)
  const [eligibleStages, setEligibleStages] = useState([])
  const [stageId, setStageId] = useState('')
  const [vendorOptions, setVendorOptions] = useState([])
  const [availableQty, setAvailableQty] = useState(null)
  // Stage progress ("jobwork stage status") per stage id of the chosen PRD.
  const [stageStatus, setStageStatus] = useState({})

  const [form, setForm] = useState({ vendor_id: '', qty: '', dispatch_date: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [ords, jwts, disps, vends] = await Promise.all([
        listOrdersByPrd(),
        listJobWorkTypes(),
        listJobOrderStatus(),
        listVendors(),
      ])
      setVendors(vends)
      setOrders(ords)
      setJobWorkTypes(jwts)
      setDispatches(disps)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handlePrdChange(e) {
    const prd = e.target.value
    setPrdNo(prd)
    setStageId('')
    setVendorOptions([])
    setAvailableQty(null)
    setStageStatus({})
    if (!prd) {
      setEligibleStages([])
      return
    }
    setError(null)
    try {
      const [stages, progress] = await Promise.all([listPendingOutsourcedStagesForPrd(prd), listJobworkStageStatus(prd)])
      setEligibleStages(stages)
      setStageStatus(Object.fromEntries(progress.map((p) => [p.stage_id, p])))
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleStageChange(e) {
    const id = e.target.value
    setStageId(id)
    setAvailableQty(null)
    setVendorOptions([])
    const stage = eligibleStages.find((s) => String(s.id) === String(id))
    if (!stage) return
    setError(null)
    try {
      const [vendors, order, allStages, aggregates, wipAggregates] = await Promise.all([
        listVendorsForJobWorkCode(stage.job_work_code),
        Promise.resolve(orders.find((o) => o.prd_no === prdNo)),
        getStagesForPrd(prdNo),
        getStageAggregatesForPrd(prdNo),
        getWipAggregatesForPrd(prdNo),
      ])
      setVendorOptions(vendors)
      const availability = computeStageAvailability(allStages, order?.prd_qty ?? 0, aggregates, wipAggregates)
      setAvailableQty(availability[stage.id] ?? 0)
    } catch (e) {
      setError(e.message)
    }
  }

  const selectedStage = eligibleStages.find((s) => String(s.id) === String(stageId))
  const selectedProgress = selectedStage ? stageStatus[selectedStage.id] : null
  // A stage can be split across vendors: every DC still open on it.
  const openDcsForStage = selectedStage ? dispatches.filter((d) => d.is_open && String(d.stage_id) === String(selectedStage.id)) : []

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function expectedReceiptDate() {
    if (!form.dispatch_date || !selectedStage) return ''
    const jwt = jobWorkTypes.find((j) => j.job_work_code === selectedStage.job_work_code)
    if (!jwt?.lead_time_days) return ''
    const d = new Date(form.dispatch_date)
    d.setDate(d.getDate() + jwt.lead_time_days)
    return d.toISOString().slice(0, 10)
  }

  async function handleSave() {
    if (!prdNo || !selectedStage || !form.vendor_id || !form.qty || !form.dispatch_date) {
      setError('PRD, Stage, Vendor, Qty and Dispatch Date are all required.')
      return
    }
    const qty = Number(form.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Qty must be a number greater than zero.')
      return
    }
    // Available = accepted pieces reaching this stage (previous stage's good
    // output, minus what went into WIP, plus WIP issued to this stage) minus
    // what has already been dispatched for it.
    const overError = qtyOverLimitError(qty, availableQty ?? 0, 'Dispatch qty', 'the quantity available for this stage')
    if (overError) {
      setError(overError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const dcNo = await generateNextDcNo()
      await createDispatch({
        dc_no: dcNo,
        prd_no: prdNo,
        stage_id: selectedStage.id,
        job_work_code: selectedStage.job_work_code,
        vendor_id: form.vendor_id,
        part_serial_number: orders.find((o) => o.prd_no === prdNo)?.part_serial_number,
        qty,
        dispatch_date: form.dispatch_date,
        expected_receipt_date: toDateOrNull(expectedReceiptDate()),
      })
      setForm({ vendor_id: '', qty: '', dispatch_date: '' })
      setPrdNo('')
      setStageId('')
      setEligibleStages([])
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredDispatches = dispatches.map((d) => ({ ...d, vendor_label: vendorLabel(d.vendor_id, vendors), progress: `${Number(d.qty_received ?? 0)} / ${Number(d.qty)}` })).filter((d) => {
    if (!search) return true
    const q = search.toLowerCase()
    return d.dc_no?.toLowerCase().includes(q) || d.prd_no?.toLowerCase().includes(q) || d.vendor_label.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Job Order Dispatch" subtitle="Send a Batch Out to a Vendor" />
      <ActionToolbar
        showCrudButtons={false}
        onExportExcel={() => exportToCsv(LIST_COLUMNS, filteredDispatches, 'jobwork_dispatches.csv')}
        onExportPdf={() => exportToPdf(LIST_COLUMNS, filteredDispatches, 'Job Order Dispatches', 'jobwork_dispatches')}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={Truck} title="1. Dispatch Details" subtitle="Batch sent out to a vendor" columns={3}>
          <Field label="Production Order (PRD No)" required>
            <SearchableSelect value={prdNo} onChange={handlePrdChange} options={orders.map((o) => o.prd_no)} />
          </Field>
          <Field label="Part Serial Number">
            <AutoFillBox value={part.part_serial_number} />
          </Field>
          <Field label="Part Name">
            <AutoFillBox value={part.part_name} />
          </Field>
          <Field label="Part Drawing Number">
            <AutoFillBox value={part.part_drawing_reference_number} />
          </Field>
          <Field label="Outsourced Stage" required>
            <SearchableSelect
              value={stageId}
              onChange={handleStageChange}
              disabled={!prdNo || eligibleStages.length === 0}
              options={eligibleStages.map((s) => {
                const p = stageStatus[s.id]
                return { value: String(s.id), label: p && p.dc_count > 0 ? `${stageLabel(s)} (${stageBackText(p)})` : stageLabel(s) }
              })}
            />
          </Field>
          <Field label="Job Work Type">
            <TextInput value={selectedStage?.job_work_code ?? ''} disabled />
          </Field>
          <Field label="Lead Time (days)">
            <AutoFillBox
              value={jobWorkTypes.find((j) => j.job_work_code === selectedStage?.job_work_code)?.lead_time_days ?? ''}
            />
          </Field>
          <Field label="Vendor" required>
            <SearchableSelect
              value={form.vendor_id}
              onChange={handleField('vendor_id')}
              disabled={vendorOptions.length === 0}
              options={vendorOptions.map((id) => ({ value: id, label: vendorLabel(id, vendors) }))}
            />
          </Field>
          <Field label={`Qty${availableQty !== null ? ` (Available: ${availableQty})` : ''}`} required>
            <TextInput type="number" value={form.qty} onChange={handleField('qty')} />
          </Field>
          <Field label="DC No">
            {/* Auto-generated on save (DC-001, DC-002, ...) -- never
                user-entered. None of the existing dispatches followed a
                consistent format, so this starts a fresh sequence rather
                than continuing one; they're left exactly as they are. */}
            <AutoFillBox value="(auto-generated on save)" />
          </Field>
          <Field label="Dispatch Date" required>
            <TextInput type="date" value={form.dispatch_date} onChange={handleField('dispatch_date')} />
          </Field>
          <Field label="Expected Receipt Date">
            <TextInput value={expectedReceiptDate()} disabled />
          </Field>
          <div className="flex items-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-green-700"
            >
              {saving ? 'Dispatching...' : 'Dispatch'}
            </button>
          </div>
          {selectedStage && (
            <div className="sm:col-span-3 rounded border border-slate-200 bg-white p-2.5 text-[13px]">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-700">This stage:</span>
                <StatusPill status={selectedProgress?.stage_status ?? 'Not Sent'} />
                <span className="text-slate-600">{stageBackText(selectedProgress)}</span>
              </div>
              {openDcsForStage.length === 0 ? (
                <p className="text-slate-500">No open DCs on this stage.</p>
              ) : (
                <table className="w-full text-left">
                  <thead className="text-slate-500">
                    <tr><th className="py-1 pr-3 font-medium">Open DC</th><th className="pr-3 font-medium">Vendor</th><th className="pr-3 text-right font-medium">Sent</th><th className="pr-3 text-right font-medium">Received</th><th className="text-right font-medium">Balance</th></tr>
                  </thead>
                  <tbody>
                    {openDcsForStage.map((d) => (
                      <tr key={d.dc_no} className="border-t border-slate-100">
                        <td className="py-1 pr-3">{d.dc_no}</td>
                        <td className="pr-3">{vendorLabel(d.vendor_id, vendors)}</td>
                        <td className="pr-3 text-right">{Number(d.qty)}</td>
                        <td className="pr-3 text-right">{Number(d.qty_received ?? 0)}</td>
                        <td className="text-right font-semibold">{dcBalance(d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {prdNo && eligibleStages.length === 0 && (
            <p className="text-sm text-amber-600 sm:col-span-3">
              This order has no pending Outsourced stage to dispatch.
            </p>
          )}
        </FormSection>

        <RecordsList
          title="Job Order Dispatches"
          columns={LIST_COLUMNS}
          rows={filteredDispatches}
          loading={loading}
          rowKey="dc_no" searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by DC No / PRD No..." />
      </div>
    </div>
  )
}
