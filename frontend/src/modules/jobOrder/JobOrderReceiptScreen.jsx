import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import usePartForPrd from '../../utils/usePartForPrd'
import { listVendors } from '../../data/queries/vendors'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import RecordsList from '../../components/RecordsList'
import { listDispatchesWithoutReceipt, createReceipt, listJobOrderStatus, listReceiptNumbers } from '../../data/queries/jobOrders'

const LIST_COLUMNS = [
  { key: 'receipt_no', label: 'Receipt No' },
  { key: 'dc_no', label: 'DC No' },
  { key: 'prd_no', label: 'PRD No' },
  { key: 'job_work_code', label: 'Job Work' },
  { key: 'vendor_id', label: 'Vendor' },
  { key: 'qty', label: 'Dispatched Qty' },
  { key: 'qty_received', label: 'Received Qty' },
  { key: 'status', label: 'Status', type: 'status' },
]

export default function JobOrderReceiptScreen() {
  const [pending, setPending] = useState([])
  const [statusRows, setStatusRows] = useState([])
  const [vendors, setVendors] = useState([])
  const [jobWorkTypes, setJobWorkTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [dcNo, setDcNo] = useState('')
  const [qtyReceived, setQtyReceived] = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedReceiptNo, setSavedReceiptNo] = useState('')
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [pend, status, receiptNos, vendorRows, jobWorkRows] = await Promise.all([
        listDispatchesWithoutReceipt(),
        listJobOrderStatus(),
        listReceiptNumbers(),
        listVendors(),
        listJobWorkTypes(),
      ])
      setPending(pend)
      const receiptNoByDc = new Map(receiptNos.map((r) => [r.dc_no, r.receipt_no]))
      setStatusRows(status.map((r) => ({ ...r, receipt_no: receiptNoByDc.get(r.dc_no) ?? '' })))
      setVendors(vendorRows)
      setJobWorkTypes(jobWorkRows)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const selectedDispatch = pending.find((d) => d.dc_no === dcNo)
  // Display-only details of the chosen DC (Jobwork Order Receipt spec).
  const part = usePartForPrd(selectedDispatch?.prd_no)
  const jobWorkType = jobWorkTypes.find((j) => j.job_work_code === selectedDispatch?.job_work_code)
  const vendor = vendors.find((v) => v.vendor_id === selectedDispatch?.vendor_id)

  async function handleSave() {
    if (!dcNo || !qtyReceived || !receiptDate) {
      setError('DC No, Qty Received and Receipt Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await createReceipt({ dc_no: dcNo, qty_received: Number(qtyReceived), receipt_date: receiptDate })
      setSavedReceiptNo(saved?.receipt_no ?? '')
      setDcNo('')
      setQtyReceived('')
      setReceiptDate('')
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredStatusRows = statusRows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.dc_no?.toLowerCase().includes(q) || r.receipt_no?.toLowerCase().includes(q) || r.prd_no?.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Job Order Receipt" subtitle="Batch Coming Back From a Vendor" />
      <ActionToolbar
        showCrudButtons={false}
        showExport={false}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={PackageCheck} title="1. Receipt Details" subtitle="Batch returned from a vendor" columns={3}>
          <Field label="Receipt No">
            <TextInput value={savedReceiptNo || '(auto-generated on save)'} readOnly />
          </Field>
          <Field label="Dispatch (DC No)" required>
            <SearchableSelect value={dcNo} onChange={(e) => { setDcNo(e.target.value); setSavedReceiptNo('') }} options={pending.map((d) => d.dc_no)} />
          </Field>
          <Field label="Production Order (PRD No)">
            <AutoFillBox value={selectedDispatch?.prd_no ?? ''} />
          </Field>
          <Field label="Type of Job Order">
            <AutoFillBox value={jobWorkType?.type_of_job_work ?? selectedDispatch?.job_work_code ?? ''} />
          </Field>
          <Field label="Job Work Vendor Name">
            <AutoFillBox value={vendor?.vendor_name ?? selectedDispatch?.vendor_id ?? ''} />
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
          <Field label="Dispatched Qty">
            <TextInput value={selectedDispatch?.qty ?? ''} disabled />
          </Field>
          <Field label="Expected Date of Delivery">
            <AutoFillBox value={selectedDispatch?.expected_receipt_date ?? ''} />
          </Field>
          <Field label="Qty Received" required>
            <TextInput type="number" value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} />
          </Field>
          <Field label="Receipt Date" required>
            <TextInput type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-green-700"
            >
              {saving ? 'Recording...' : 'Record Receipt'}
            </button>
          </div>
          {pending.length === 0 && !loading && (
            <p className="text-sm text-gray-400 sm:col-span-3">No dispatches are awaiting receipt.</p>
          )}
        </FormSection>

        <RecordsList title="Job Order Status" columns={LIST_COLUMNS} rows={filteredStatusRows} loading={loading} rowKey="dc_no" searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by DC No / PRD No..." />
      </div>
    </div>
  )
}
