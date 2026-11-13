import { useEffect, useMemo, useState } from 'react'
import { PackageCheck, Ban, Pencil } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import FormSection, { Field, TextInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import StatusPill from '../../components/StatusPill'
import usePartForPrd from '../../utils/usePartForPrd'
import { listVendors } from '../../data/queries/vendors'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import RecordsList from '../../components/RecordsList'
import { createReceipt, closeDispatchShort, listJobOrderStatus, listReceipts, updateReceipt } from '../../data/queries/jobOrders'
import { canEditStock } from '../../utils/stockEdit'
import { statusSearchText } from '../../utils/statusLabels'
import {
  dcBalance,
  receiptQtyError,
  closeShortReasonError,
  canShowCloseShort,
  closeShortPromptText,
  openDcLabel,
  receiptEditBlockReason,
  receiptEditMax,
  receiptEditError,
  receiptEditPatch,
  jobworkDbErrorMessage,
} from '../../utils/jobwork'
import { useAppUsers, withEditedLabels, EDITED_COLUMN } from '../../components/StockEditPanel'
import Banner from '../../components/Banner'
import OrderLineFields from '../../components/OrderLineFields'
import ConfirmDialog from '../../components/ConfirmDialog'

// One row per receipt (JR number); a DC can have several since migration 031.
const LIST_COLUMNS = [
  { key: 'receipt_no', label: 'Receipt No' },
  { key: 'receipt_date', label: 'Receipt Date' },
  { key: 'dc_no', label: 'DC No' },
  { key: 'prd_no', label: 'PRD No' },
  { key: 'job_work_code', label: 'Job Work' },
  { key: 'vendor_label', label: 'Vendor' },
  { key: 'qty_received', label: 'Qty Received' },
  { key: 'dc_progress', label: 'DC Received / Sent' },
  { key: 'dc_status', label: 'DC Status', type: 'status' },
]

/**
 * Job Order Receipt. Pick an OPEN DC (Sent or Partially Received), see what
 * was sent, what has come back and the balance, and record a receipt of up
 * to that balance -- as many receipts per DC as needed. A supervisor/admin
 * can Close Short an open DC with a reason (even with nothing received) --
 * a separate "Close DC Short..." button + confirm (2026-11-13), hidden while a
 * receipt qty is typed, never part of recording a partial receipt.
 * The database enforces the same rules (migration 031).
 */
export default function JobOrderReceiptScreen({ role, initialDcNo = null }) {
  const [dcRows, setDcRows] = useState([])
  const [receipts, setReceipts] = useState([])
  const [vendors, setVendors] = useState([])
  const [jobWorkTypes, setJobWorkTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')

  const [dcNo, setDcNo] = useState('')
  const [qtyReceived, setQtyReceived] = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedReceiptNo, setSavedReceiptNo] = useState('')
  const [shortReason, setShortReason] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeShortOpen, setCloseShortOpen] = useState(false)
  const [search, setSearch] = useState('')

  const canCloseShort = canEditStock(role)
  const canEdit = canEditStock(role)
  const appUsers = useAppUsers()
  const [selectedRow, setSelectedRow] = useState(null)
  // Edit (033): receipt being edited + its draft.
  const [editingRow, setEditingRow] = useState(null)
  const [editDraft, setEditDraft] = useState({ qty_received: '', receipt_date: '' })
  const [editError, setEditError] = useState(null)
  const [editSaving, setEditSaving] = useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [status, receiptRows, vendorRows, jobWorkRows] = await Promise.all([
        listJobOrderStatus(),
        listReceipts(),
        listVendors(),
        listJobWorkTypes(),
      ])
      setDcRows(status)
      setReceipts(receiptRows)
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

  // Opened from a "Needs attention" reminder: pick that DC once loaded (only
  // if it is still open -- received / closed DCs are not in the picker).
  useEffect(() => {
    if (!initialDcNo || loading) return
    if (dcRows.some((d) => d.is_open && d.dc_no === initialDcNo)) setDcNo(initialDcNo)
  }, [initialDcNo, loading, dcRows])

  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.vendor_id, v.vendor_name])), [vendors])
  const openDcs = dcRows.filter((d) => d.is_open)
  const selectedDc = openDcs.find((d) => d.dc_no === dcNo)
  const balance = selectedDc ? dcBalance(selectedDc) : null
  // Display-only details of the chosen DC (Jobwork Order Receipt spec).
  const part = usePartForPrd(selectedDc?.prd_no)
  const jobWorkType = jobWorkTypes.find((j) => j.job_work_code === selectedDc?.job_work_code)

  function selectDc(value) {
    setDcNo(value)
    setSelectedRow(null)
    setSavedReceiptNo('')
    setQtyReceived('')
    setShortReason('')
    setNotice('')
    setError(null)
  }

  async function handleSave() {
    setNotice('')
    if (!dcNo || !qtyReceived || !receiptDate) {
      setError('DC No, Qty Received and Receipt Date are all required.')
      return
    }
    const qtyError = receiptQtyError(qtyReceived, selectedDc)
    if (qtyError) {
      setError(qtyError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await createReceipt({ dc_no: dcNo, qty_received: Number(qtyReceived), receipt_date: receiptDate })
      const left = balance - Number(qtyReceived)
      setSavedReceiptNo(saved?.receipt_no ?? '')
      setNotice(left > 0 ? `${saved?.receipt_no} saved -- ${left} still to come on ${dcNo}.` : `${saved?.receipt_no} saved -- ${dcNo} fully received and closed.`)
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

  // Close DC Short (031): separate supervisor action -> ConfirmDialog with a
  // required reason. The dialog closes itself after onConfirm resolves.
  function openCloseShort() {
    setShortReason('')
    setNotice('')
    setError(null)
    setCloseShortOpen(true)
  }

  async function handleCloseShort() {
    if (closeShortReasonError(shortReason)) return
    const dc = dcNo
    const short = balance
    setClosing(true)
    setError(null)
    try {
      await closeDispatchShort(dc, shortReason.trim())
      selectDc('') // resets the form (and the notice) first
      setNotice(`${dc} closed short (${short} short).`)
      await refresh()
    } catch (e) {
      setError(jobworkDbErrorMessage(e))
    } finally {
      setClosing(false)
    }
  }

  const showCloseShort = canShowCloseShort({ canClose: canCloseShort, dc: selectedDc, balance, qtyTyped: qtyReceived })

  const dcByNo = useMemo(() => new Map(dcRows.map((d) => [d.dc_no, d])), [dcRows])
  const selectedBlockReason = selectedRow ? receiptEditBlockReason(selectedRow, dcByNo.get(selectedRow.dc_no)) : null
  const editingDc = editingRow ? dcByNo.get(editingRow.dc_no) : null

  function handleEdit() {
    if (!selectedRow || selectedBlockReason) return
    setEditingRow(selectedRow)
    setEditDraft({ qty_received: String(selectedRow.qty_received ?? ''), receipt_date: selectedRow.receipt_date ?? '' })
    setEditError(null)
    setNotice('')
  }

  async function handleSaveEdit() {
    const row = editingRow
    const problem = receiptEditError(editDraft, row, editingDc)
    if (problem) {
      setEditError(problem)
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      await updateReceipt(row.id, receiptEditPatch(editDraft))
      const closes = Number(editDraft.qty_received) === receiptEditMax(row, editingDc)
      setEditingRow(null)
      setSelectedRow(null)
      setNotice(closes ? `${row.receipt_no} updated -- ${row.dc_no} fully received and closed.` : `${row.receipt_no} updated.`)
      await refresh()
    } catch (e) {
      setEditError(jobworkDbErrorMessage(e))
    } finally {
      setEditSaving(false)
    }
  }

  const receiptRows = withEditedLabels(receipts, appUsers).map((r) => {
    const dc = dcByNo.get(r.dc_no)
    return {
      ...r,
      prd_no: dc?.prd_no ?? '',
      job_work_code: dc?.job_work_code ?? '',
      vendor_label: vendorName.get(dc?.vendor_id) ?? dc?.vendor_id ?? '',
      dc_progress: dc ? `${Number(dc.qty_received ?? 0)} / ${Number(dc.qty)}` : '',
      dc_status: dc?.status ?? '',
    }
  })
  const filteredRows = receiptRows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return [r.dc_no, r.receipt_no, r.prd_no, r.vendor_label].some((v) => v?.toLowerCase().includes(q)) || statusSearchText(r.dc_status).includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Job Order Receipt" subtitle="Batch Coming Back From a Vendor" />
      {/* Edit: supervisor/admin, receipts of an open DC only (033). Never Delete. */}
      <ActionToolbar
        showEditDelete={canEdit}
        showDelete={false}
        onEdit={handleEdit}
        canEdit={!!selectedRow && !editingRow && !selectedBlockReason}
        onNew={() => { selectDc(''); setReceiptDate('') }}
        onSave={handleSave}
        onClear={() => { selectDc(''); setReceiptDate('') }}
        canSave={!!selectedDc}
        saving={saving}
        saveLabel="Record Receipt"
        onExportExcel={() => exportToCsv(LIST_COLUMNS, filteredRows, 'jobwork_receipts.csv')}
        onExportPdf={() => exportToPdf(LIST_COLUMNS, filteredRows, 'Jobwork Receipts', 'jobwork_receipts')}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && <Banner tone="error" message={error} />}
        {notice && <Banner tone="success" message={notice} onClose={() => setNotice(null)} />}
        {canEdit && selectedBlockReason && !editingRow && (
          <div className="bg-slate-50 border border-slate-200 text-slate-600 text-sm px-4 py-2 rounded">Edit unavailable: {selectedBlockReason}</div>
        )}

        {editingRow && (
          <FormSection icon={Pencil} title={`Edit Receipt ${editingRow.receipt_no}`} subtitle="Supervisor / admin correction -- recorded with who and when" columns={3}>
            {editError && <Banner tone="error" message={editError} />}
            <Field label="DC No"><AutoFillBox value={editingRow.dc_no} /></Field>
            <Field label="DC Sent / Received"><AutoFillBox value={editingDc ? `${Number(editingDc.qty)} / ${Number(editingDc.qty_received ?? 0)}` : ''} /></Field>
            <Field label="DC Status">
              <div className="flex h-[34px] items-center">{editingDc ? <StatusPill status={editingDc.status} /> : <AutoFillBox value="" />}</div>
            </Field>
            <Field label={`Qty Received (max ${receiptEditMax(editingRow, editingDc)} (DC balance))`} required>
              <TextInput type="number" value={editDraft.qty_received} onChange={(e) => setEditDraft((d) => ({ ...d, qty_received: e.target.value }))} />
            </Field>
            <Field label="Receipt Date" required>
              <TextInput type="date" value={editDraft.receipt_date} onChange={(e) => setEditDraft((d) => ({ ...d, receipt_date: e.target.value }))} />
            </Field>
            <div className="flex sm:col-span-3 items-center gap-2 pt-1">
              <button type="button" onClick={handleSaveEdit} disabled={editSaving} className="rounded bg-bmlhblue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => { setEditingRow(null); setEditError(null) }} disabled={editSaving} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
                Cancel
              </button>
            </div>
          </FormSection>
        )}

        <FormSection icon={PackageCheck} title="1. Receipt Details" subtitle="Batch returned from a vendor -- part or all of a DC" columns={3}>
          <Field label="Receipt No">
            <TextInput value={savedReceiptNo || '(auto-generated on save)'} readOnly />
          </Field>
          <Field label="Receipt Date" required>
            <TextInput type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} disabled={!selectedDc} />
          </Field>
          <Field label="Despatch (DC No)" required>
            <SearchableSelect
              value={dcNo}
              onChange={(e) => selectDc(e.target.value)}
              options={openDcs.map((d) => ({ value: d.dc_no, label: openDcLabel(d, vendorName.get(d.vendor_id)) }))}
            />
          </Field>
          <Field label="DC Status">
            <div className="flex h-[34px] items-center gap-2">
              {selectedDc ? <StatusPill status={selectedDc.status} /> : <AutoFillBox value="" />}
              {showCloseShort && (
                <button
                  type="button"
                  onClick={openCloseShort}
                  disabled={closing || saving}
                  title="Supervisor / admin: nothing more is coming back on this DC"
                  className="inline-flex items-center gap-1 rounded border border-slate-400 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Ban size={12} />
                  Close DC Short...
                </button>
              )}
            </div>
          </Field>
          <Field label="PRD No">
            <AutoFillBox value={selectedDc?.prd_no ?? ''} />
          </Field>
          <Field label="Part Serial No">
            <AutoFillBox value={part.part_serial_number} />
          </Field>
          <Field label="Part Name">
            <AutoFillBox value={part.part_name} />
          </Field>
          <Field label="Part Drawing No">
            <AutoFillBox value={part.part_drawing_reference_number} />
          </Field>
          <Field label="Type of Job Order">
            <AutoFillBox value={jobWorkType?.type_of_job_work ?? selectedDc?.job_work_code ?? ''} />
          </Field>
          <Field label="Job Work Vendor Name">
            <AutoFillBox value={vendorName.get(selectedDc?.vendor_id) ?? selectedDc?.vendor_id ?? ''} />
          </Field>
          <Field label="Despatched Qty">
            <AutoFillBox value={selectedDc?.qty ?? ''} unit={selectedDc ? 'Nos' : undefined} />
          </Field>
          <Field label="Received So Far">
            <AutoFillBox value={selectedDc ? `${Number(selectedDc.qty_received ?? 0)}${selectedDc.receipt_nos ? ` (${selectedDc.receipt_nos})` : ''}` : ''} />
          </Field>
          <Field label="Balance To Come">
            <AutoFillBox value={balance ?? ''} unit={selectedDc ? 'Nos' : undefined} />
          </Field>
          <Field label="Expected Date of Delivery">
            <AutoFillBox value={selectedDc?.expected_receipt_date ?? ''} />
          </Field>
          <OrderLineFields part={part} />
          <Field label={`Qty Received${balance !== null ? ` (max ${balance})` : ''}`} required>
            <TextInput type="number" value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} disabled={!selectedDc} />
          </Field>
          {openDcs.length === 0 && !loading && <p className="text-sm text-gray-400 sm:col-span-3">No DCs are waiting for receipt.</p>}
        </FormSection>

        <ConfirmDialog
          open={closeShortOpen && !!selectedDc}
          title={`Close ${dcNo} short?`}
          body={selectedDc ? closeShortPromptText(selectedDc, balance) : ''}
          confirmLabel="Close Short"
          confirmDisabled={!!closeShortReasonError(shortReason)}
          onConfirm={handleCloseShort}
          onClose={() => setCloseShortOpen(false)}
        >
          <label className="block text-xs font-medium text-gray-700">
            Reason <span className="text-red-600">*</span>
            <textarea
              aria-label="Close short reason"
              rows={2}
              value={shortReason}
              onChange={(e) => setShortReason(e.target.value)}
              placeholder="e.g. 10 pcs scrapped at vendor"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
            />
          </label>
        </ConfirmDialog>

        <RecordsList
          title="Jobwork Receipts"
          columns={[...LIST_COLUMNS, EDITED_COLUMN]}
          rows={filteredRows}
          loading={loading}
          selectedKey={selectedRow?.receipt_no}
          onRowClick={(r) => { if (!editingRow) { setSelectedRow(r); setNotice('') } }}
          rowKey="receipt_no" searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by Receipt No / DC No / PRD No / Vendor / Status..." />
      </div>
    </div>
  )
}
