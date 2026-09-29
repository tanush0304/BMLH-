import { useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { getStageAggregatesForPrd } from '../../data/queries/productionLogs'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import {
  listPendingOutsourcedStagesForPrd,
  listVendorsForJobWorkCode,
  listDispatches,
  createDispatch,
} from '../../data/queries/jobOrders'
import { getWipAggregatesForPrd } from '../../data/queries/wip'
import { computeStageAvailability } from '../../utils/calculations'

const LIST_COLUMNS = [
  { key: 'dc_no', label: 'DC No' },
  { key: 'prd_no', label: 'PRD No' },
  { key: 'job_work_code', label: 'Job Work' },
  { key: 'vendor_id', label: 'Vendor' },
  { key: 'qty', label: 'Qty' },
  { key: 'dispatch_date', label: 'Dispatch Date' },
  { key: 'expected_receipt_date', label: 'Expected Receipt' },
]

export default function JobOrderDispatchScreen() {
  const [orders, setOrders] = useState([])
  const [jobWorkTypes, setJobWorkTypes] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [prdNo, setPrdNo] = useState('')
  const [eligibleStages, setEligibleStages] = useState([])
  const [stageId, setStageId] = useState('')
  const [vendorOptions, setVendorOptions] = useState([])
  const [availableQty, setAvailableQty] = useState(null)

  const [form, setForm] = useState({ dc_no: '', vendor_id: '', qty: '', dispatch_date: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [ords, jwts, disps] = await Promise.all([
        listCustomerOrders(),
        listJobWorkTypes(),
        listDispatches(),
      ])
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
    if (!prd) {
      setEligibleStages([])
      return
    }
    setError(null)
    try {
      setEligibleStages(await listPendingOutsourcedStagesForPrd(prd))
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
      const availability = computeStageAvailability(allStages, order?.order_qty ?? 0, aggregates, wipAggregates)
      setAvailableQty(availability[stage.id] ?? 0)
    } catch (e) {
      setError(e.message)
    }
  }

  const selectedStage = eligibleStages.find((s) => String(s.id) === String(stageId))

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
    if (!form.dc_no || !prdNo || !selectedStage || !form.vendor_id || !form.qty || !form.dispatch_date) {
      setError('DC No, PRD, Stage, Vendor, Qty and Dispatch Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createDispatch({
        dc_no: form.dc_no,
        prd_no: prdNo,
        stage_id: selectedStage.id,
        job_work_code: selectedStage.job_work_code,
        vendor_id: form.vendor_id,
        product_code: orders.find((o) => o.prd_no === prdNo)?.product_code,
        qty: Number(form.qty),
        dispatch_date: form.dispatch_date,
        expected_receipt_date: expectedReceiptDate() || null,
      })
      setForm({ dc_no: '', vendor_id: '', qty: '', dispatch_date: '' })
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

  const filteredDispatches = dispatches.filter((d) => {
    if (!search) return true
    const q = search.toLowerCase()
    return d.dc_no?.toLowerCase().includes(q) || d.prd_no?.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Job Order Dispatch" subtitle="Send a Batch Out to a Vendor" />
      <ActionToolbar
        showCrudButtons={false}
        searchValue={search}
        onSearchChange={setSearch}
        onSearch={() => {}}
        searchPlaceholder="Search by DC No / PRD No..."
        showExport={false}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={Truck} title="1. Dispatch Details" columns={3}>
          <Field label="Production Order (PRD No)" required>
            <SelectInput value={prdNo} onChange={handlePrdChange} options={orders.map((o) => o.prd_no)} />
          </Field>
          <Field label="Outsourced Stage" required>
            <SelectInput
              value={stageId}
              onChange={handleStageChange}
              disabled={!prdNo || eligibleStages.length === 0}
              options={eligibleStages.map((s) => String(s.id))}
            />
          </Field>
          <Field label="Job Work Type">
            <TextInput value={selectedStage?.job_work_code ?? ''} disabled />
          </Field>
          <Field label="Vendor" required>
            <SelectInput
              value={form.vendor_id}
              onChange={handleField('vendor_id')}
              disabled={vendorOptions.length === 0}
              options={vendorOptions}
            />
          </Field>
          <Field label={`Qty${availableQty !== null ? ` (available: ${availableQty})` : ''}`} required>
            <TextInput type="number" value={form.qty} onChange={handleField('qty')} />
          </Field>
          <Field label="DC No" required>
            <TextInput value={form.dc_no} onChange={handleField('dc_no')} placeholder="e.g. DC 001 HT PRD 001" />
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
          rowKey="dc_no"
        />
      </div>
    </div>
  )
}
