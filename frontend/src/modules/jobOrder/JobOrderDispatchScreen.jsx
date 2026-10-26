import { useEffect, useState } from 'react'
import { toDateOrNull } from '../../utils/numericFields'
import { Truck, Pencil } from 'lucide-react'
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
  listDispatches,
  updateDispatch,
} from '../../data/queries/jobOrders'
import { getWipAggregatesForPrd } from '../../data/queries/wip'
import { listVendors } from '../../data/queries/vendors'
import { computeStageAvailability } from '../../utils/calculations'
import { stageLabel } from '../../utils/stageLabel'
import { qtyOverLimitError } from '../../utils/qtyLimits'
import {
  dcBalance,
  dcEditBlockReason,
  dispatchEditLimits,
  dispatchLimitText,
  dispatchEditError,
  dispatchEditPatch,
  vendorLocked,
  jobworkDbErrorMessage,
} from '../../utils/jobwork'
import { canEditStock } from '../../utils/stockEdit'
import { statusSearchText } from '../../utils/statusLabels'
import { useAppUsers, withEditedLabels, EDITED_COLUMN } from '../../components/StockEditPanel'
import VoidEntryDialog, { VOID_COLUMN } from '../../components/VoidEntryDialog'
import { voidEntry } from '../../data/queries/voidEntries'
import { VOID_TYPES, voidBlockReason, withVoidLabels, voidRowClass } from '../../utils/voidEntry'

/** List rows: the "job order status" view (034 leaves voided DCs out) with
 * the table's audit / void columns, plus the voided DCs from the table. */
export function mergeDispatchRows(statusRows, tableRows) {
  const table = new Map(tableRows.map((d) => [d.dc_no, d]))
  const pick = (a) => ({
    edited_by: a?.edited_by ?? null,
    edited_at: a?.edited_at ?? null,
    previous_qty: a?.previous_qty ?? null,
    voided_at: a?.voided_at ?? null,
    voided_by: a?.voided_by ?? null,
    void_reason: a?.void_reason ?? null,
  })
  const live = statusRows.map((d) => ({ ...d, ...pick(table.get(d.dc_no)) }))
  const shown = new Set(statusRows.map((d) => d.dc_no))
  const voided = tableRows
    .filter((d) => d.voided_at && !shown.has(d.dc_no))
    .map((d) => ({ ...d, qty_received: 0, status: 'Void', is_open: false }))
  return [...live, ...voided].sort((a, b) => String(b.dispatch_date).localeCompare(String(a.dispatch_date)))
}
import { stageBackText } from '../../utils/reportOrders'
import Banner from '../../components/Banner'

const LIST_COLUMNS = [
  { key: 'dc_no', label: 'DC No' },
  { key: 'prd_no', label: 'PRD No' },
  { key: 'job_work_code', label: 'Job Work' },
  { key: 'vendor_label', label: 'Vendor' },
  { key: 'qty', label: 'Qty' },
  { key: 'dispatch_date', label: 'Despatch Date' },
  { key: 'expected_receipt_date', label: 'Expected Receipt' },
  { key: 'progress', label: 'Received / Sent' },
  { key: 'status', label: 'Status', type: 'status' },
]

function vendorLabel(vendorId, vendors) {
  const name = vendors.find((v) => v.vendor_id === vendorId)?.vendor_name
  return name ? `${vendorId} – ${name}` : vendorId ?? ''
}

export default function JobOrderDispatchScreen({ role }) {
  const appUsers = useAppUsers()
  const canEdit = canEditStock(role)
  const [selectedRow, setSelectedRow] = useState(null)
  // Edit (033): the DC being edited, its draft and its stage's availability.
  const [editingRow, setEditingRow] = useState(null)
  const [editDraft, setEditDraft] = useState({ qty: '', dispatch_date: '', vendor_id: '' })
  const [editVendorOptions, setEditVendorOptions] = useState([])
  const [editAvailable, setEditAvailable] = useState(null)
  const [editError, setEditError] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [voidingRow, setVoidingRow] = useState(null)
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
      const [ords, jwts, disps, vends, raw] = await Promise.all([
        listOrdersByPrd(),
        listJobWorkTypes(),
        listJobOrderStatus(),
        listVendors(),
        listDispatches(),
      ])
      setVendors(vends)
      setOrders(ords)
      setJobWorkTypes(jwts)
      setDispatches(mergeDispatchRows(disps, raw))
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
      const [vendors, available] = await Promise.all([
        listVendorsForJobWorkCode(stage.job_work_code),
        stageAvailable(prdNo, stage.id),
      ])
      setVendorOptions(vendors)
      setAvailableQty(available)
    } catch (e) {
      setError(e.message)
    }
  }

  // Same figure as Available on a new DC (computeStageAvailability).
  async function stageAvailable(prd, id) {
    const [allStages, aggregates, wipAggregates] = await Promise.all([
      getStagesForPrd(prd),
      getStageAggregatesForPrd(prd),
      getWipAggregatesForPrd(prd),
    ])
    const order = orders.find((o) => o.prd_no === prd)
    const availability = computeStageAvailability(allStages, order?.prd_qty ?? 0, aggregates, wipAggregates)
    return availability[id] ?? 0
  }

  const selectedBlockReason = selectedRow ? dcEditBlockReason(selectedRow) : null
  const voidBlock = canEdit && selectedRow ? voidBlockReason(VOID_TYPES.DC, selectedRow) : null

  async function handleVoid(reason) {
    const row = voidingRow
    try {
      await voidEntry(VOID_TYPES.DC, row.dc_no, reason)
    } catch (e) {
      return jobworkDbErrorMessage(e)
    }
    setVoidingRow(null)
    setSelectedRow(null)
    setNotice(`${row.dc_no} voided -- ${Number(row.qty)} ${Number(row.qty) === 1 ? 'piece is' : 'pieces are'} available to despatch again.`)
    await refresh()
    if (prdNo) {
      const progress = await listJobworkStageStatus(prdNo)
      setStageStatus(Object.fromEntries(progress.map((p) => [p.stage_id, p])))
      if (stageId) setAvailableQty(await stageAvailable(prdNo, stageId))
    }
    return null
  }

  async function handleEdit() {
    if (!selectedRow || dcEditBlockReason(selectedRow)) return
    const row = selectedRow
    setEditingRow(row)
    setEditDraft({ qty: String(row.qty ?? ''), dispatch_date: row.dispatch_date ?? '', vendor_id: row.vendor_id ?? '' })
    setEditAvailable(null)
    setEditError(null)
    setNotice('')
    try {
      const [vendorIds, available] = await Promise.all([
        listVendorsForJobWorkCode(row.job_work_code),
        stageAvailable(row.prd_no, row.stage_id),
      ])
      setEditVendorOptions(vendorIds.includes(row.vendor_id) ? vendorIds : [row.vendor_id, ...vendorIds])
      setEditAvailable(available)
    } catch (e) {
      setEditError(e.message)
    }
  }

  async function handleSaveEdit() {
    const row = editingRow
    const problem = dispatchEditError(editDraft, row, dispatchEditLimits(row, editAvailable))
    if (problem) {
      setEditError(problem)
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      const saved = await updateDispatch(row.dc_no, dispatchEditPatch(editDraft, row))
      setEditingRow(null)
      setSelectedRow(null)
      setNotice(saved?.is_open === false ? `${row.dc_no} updated -- fully received, DC closed.` : `${row.dc_no} updated.`)
      await refresh()
      // Stage panel + Available of the stage picked in the form, if any.
      if (prdNo) {
        const progress = await listJobworkStageStatus(prdNo)
        setStageStatus(Object.fromEntries(progress.map((p) => [p.stage_id, p])))
        if (stageId) setAvailableQty(await stageAvailable(prdNo, stageId))
      }
    } catch (e) {
      setEditError(jobworkDbErrorMessage(e))
    } finally {
      setEditSaving(false)
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
      setError('PRD, Stage, Vendor, Qty and Despatch Date are all required.')
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
    const overError = qtyOverLimitError(qty, availableQty ?? 0, 'Despatch qty', 'the quantity available for this stage')
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
      setSelectedRow(null)
      setPrdNo('')
      setStageId('')
      setEligibleStages([])
      // Picking the PRD + stage again recomputes it from the new dispatch.
      setAvailableQty(null)
      setStageStatus({})
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleClear() {
    setForm({ vendor_id: '', qty: '', dispatch_date: '' })
    setError(null)
    handlePrdChange({ target: { value: '' } })
  }

  const filteredDispatches = withVoidLabels(withEditedLabels(dispatches, appUsers), appUsers).map((d) => ({ ...d, vendor_label: vendorLabel(d.vendor_id, vendors), progress: `${Number(d.qty_received ?? 0)} / ${Number(d.qty)}` })).filter((d) => {
    if (!search) return true
    const q = search.toLowerCase()
    return d.dc_no?.toLowerCase().includes(q) || d.prd_no?.toLowerCase().includes(q) || d.vendor_label.toLowerCase().includes(q) || statusSearchText(d.status).includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Job Order Despatch" subtitle="Send a Batch Out to a Vendor" />
      {/* Edit: supervisor/admin, open DCs only (033). Never Delete. */}
      <ActionToolbar
        showEditDelete={canEdit}
        showDelete={false}
        onEdit={handleEdit}
        canEdit={!!selectedRow && !editingRow && !selectedBlockReason}
        showVoid={canEdit}
        onVoid={() => { setNotice(''); setVoidingRow(selectedRow) }}
        canVoid={!!selectedRow && !editingRow && !voidBlock}
        voidTitle={voidBlock ?? undefined}
        onNew={handleClear}
        onSave={handleSave}
        onClear={handleClear}
        saving={saving}
        saveLabel="Despatch"
        onExportExcel={() => exportToCsv(LIST_COLUMNS, filteredDispatches, 'jobwork_despatches.csv')}
        onExportPdf={() => exportToPdf(LIST_COLUMNS, filteredDispatches, 'Job Order Despatches', 'jobwork_despatches')}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <Banner tone="error" message={error} />
        )}
        {notice && <Banner tone="success" message={notice} onClose={() => setNotice(null)} />}
        {canEdit && selectedBlockReason && !editingRow && (
          <div className="bg-slate-50 border border-slate-200 text-slate-600 text-sm px-4 py-2 rounded">Edit unavailable: {selectedBlockReason}</div>
        )}
        {voidBlock && !editingRow && (
          <div className="bg-slate-50 border border-slate-200 text-slate-600 text-sm px-4 py-2 rounded">Void unavailable: {voidBlock}</div>
        )}
        {voidingRow && (
          <VoidEntryDialog docNo={voidingRow.dc_no} onConfirm={handleVoid} onCancel={() => setVoidingRow(null)} />
        )}

        {editingRow && (
          <FormSection icon={Pencil} title={`Edit Despatch ${editingRow.dc_no}`} subtitle="Supervisor / admin correction -- recorded with who and when" columns={3}>
            {editError && <Banner tone="error" message={editError} />}
            <Field label="PRD No"><AutoFillBox value={editingRow.prd_no} /></Field>
            <Field label="Job Work Type"><AutoFillBox value={editingRow.job_work_code} /></Field>
            <Field label="DC Status">
              <div className="flex h-[34px] items-center"><StatusPill status={editingRow.status} /></div>
            </Field>
            <Field label={`Qty (${dispatchLimitText(dispatchEditLimits(editingRow, editAvailable))})`} required>
              <TextInput type="number" value={editDraft.qty} onChange={(e) => setEditDraft((d) => ({ ...d, qty: e.target.value }))} />
            </Field>
            <Field label="Despatch Date" required>
              <TextInput type="date" value={editDraft.dispatch_date} onChange={(e) => setEditDraft((d) => ({ ...d, dispatch_date: e.target.value }))} />
            </Field>
            <Field label={vendorLocked(editingRow) ? 'Vendor (locked: pieces received)' : 'Vendor'} required>
              <SearchableSelect
                value={editDraft.vendor_id}
                onChange={(e) => setEditDraft((d) => ({ ...d, vendor_id: e.target.value }))}
                disabled={vendorLocked(editingRow)}
                options={editVendorOptions.map((id) => ({ value: id, label: vendorLabel(id, vendors) }))}
              />
            </Field>
            <Field label="Expected Receipt Date">
              <AutoFillBox value={editingRow.expected_receipt_date ?? ''} />
            </Field>
            <p className="sm:col-span-2 self-end text-xs text-slate-500">Recalculated from the lead time when the Despatch Date changes (shown after save).</p>
            <div className="flex sm:col-span-3 items-center gap-2 pt-1">
              <button type="button" onClick={handleSaveEdit} disabled={editSaving || editAvailable === null} className="rounded bg-bmlhblue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => { setEditingRow(null); setEditError(null) }} disabled={editSaving} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
                Cancel
              </button>
            </div>
          </FormSection>
        )}

        <FormSection icon={Truck} title="1. Despatch Details" subtitle="Batch sent out to a vendor" columns={3}>
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
          <Field label="Despatch Date" required>
            <TextInput type="date" value={form.dispatch_date} onChange={handleField('dispatch_date')} />
          </Field>
          <Field label="Expected Receipt Date">
            <TextInput value={expectedReceiptDate()} disabled />
          </Field>
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
          title="Job Order Despatches"
          columns={[...LIST_COLUMNS, EDITED_COLUMN, VOID_COLUMN]}
          rows={filteredDispatches}
          loading={loading}
          rowClassName={voidRowClass}
          selectedKey={selectedRow?.dc_no}
          onRowClick={(r) => { if (!editingRow) { setSelectedRow(r); setNotice('') } }}
          rowKey="dc_no" searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by DC No / PRD No / Status..." />
      </div>
    </div>
  )
}
