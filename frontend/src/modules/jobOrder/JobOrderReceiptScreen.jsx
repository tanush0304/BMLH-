import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listDispatchesWithoutReceipt, createReceipt, listJobOrderStatus } from '../../data/queries/jobOrders'

const LIST_COLUMNS = [
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [dcNo, setDcNo] = useState('')
  const [qtyReceived, setQtyReceived] = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [pend, status] = await Promise.all([listDispatchesWithoutReceipt(), listJobOrderStatus()])
      setPending(pend)
      setStatusRows(status)
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

  async function handleSave() {
    if (!dcNo || !qtyReceived || !receiptDate) {
      setError('DC No, Qty Received and Receipt Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createReceipt({ dc_no: dcNo, qty_received: Number(qtyReceived), receipt_date: receiptDate })
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

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Job Order Receipt" subtitle="Batch Coming Back From a Vendor" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={PackageCheck} title="1. Receipt Details" columns={3}>
          <Field label="Dispatch (DC No)" required>
            <SelectInput value={dcNo} onChange={(e) => setDcNo(e.target.value)} options={pending.map((d) => d.dc_no)} />
          </Field>
          <Field label="Dispatched Qty">
            <TextInput value={selectedDispatch?.qty ?? ''} disabled />
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
              className="bg-green-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-green-700"
            >
              {saving ? 'Recording...' : 'Record Receipt'}
            </button>
          </div>
          {pending.length === 0 && !loading && (
            <p className="text-sm text-gray-400 sm:col-span-3">No dispatches are awaiting receipt.</p>
          )}
        </FormSection>

        <RecordsList title="Job Order Status" columns={LIST_COLUMNS} rows={statusRows} loading={loading} rowKey="dc_no" />
      </div>
    </div>
  )
}
