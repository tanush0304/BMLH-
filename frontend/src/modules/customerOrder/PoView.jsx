import { useCallback, useEffect, useState } from 'react'
import { FileStack, ClipboardList, Plus, History, XCircle, Pencil, Lock, Unlock } from 'lucide-react'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import StatusPill from '../../components/StatusPill'
import Banner from '../../components/Banner'
import { useDeleteConfirm } from '../../components/ConfirmDialog'
import { useAppUsers } from '../../components/StockEditPanel'
import { productOptions, partsForCustomer } from '../../utils/productOptions'
import { useProductCustomerSupported } from '../../utils/useProductCustomer'
import { userDisplayName } from '../../utils/stockEdit'
import { formatStamp } from '../../utils/shiftVerification'
import { dbErrorMessage } from '../../utils/dbErrors'
import { withTypedFields } from '../../utils/numericFields'
import { orderLineProblem } from '../../utils/orderValidation'
import { ORDER_TYPES, DEFAULT_ORDER_TYPE, orderTypeProblem } from '../../utils/orderType'
import { defaultAddressId, deliverToOptions, deliverToProblem, deliveryIdOrNull, deliveryText } from '../../utils/deliveryAddress'
import { fmtQtyIn, orderQtyProblem, cancelLineProblem, prdState, poExpired } from '../../utils/openPo'
import { getPoHeader, updatePoHeader, listLineStatuses, listLineEdits, updateLineQty, cancelLine, listPrdStatesForLine } from '../../data/queries/openPo'
import { createCustomerOrder } from '../../data/queries/customerOrders'
import { formatLocalISODate } from '../../utils/dates'

const EMPTY_LINE = { part: '', orderType: DEFAULT_ORDER_TYPE, deliveryAddressId: '', orderQty: '', expectedDelivery: '', customerPoLineNo: '' }

function ReasonDialog({ title, note, confirmLabel, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  async function confirm() {
    if (!reason.trim()) {
      setError('A reason is required to cancel a PO line.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const msg = await onConfirm(reason.trim())
      if (msg) setError(msg)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-red-700">
          <XCircle size={18} />
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{note}</p>
        {error && <Banner tone="error" message={error} inline className="mb-3" />}
        <label className="block text-xs font-medium text-slate-700">
          Reason <span className="text-red-600">*</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
            Back
          </button>
          <button type="button" onClick={confirm} disabled={busy} className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
            {busy ? 'Cancelling...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * One customer PO (043): header validity + status (Close / Reopen), its lines
 * with status / planned / despatched, qty edit, cancel, history, Add line.
 * Supervisor / admin for the changes (the module is supervisor/admin only;
 * the DB guards check again).
 */
export default function PoView({ poId, role, customers, products, delivery, orderLines = [], onChanged }) {
  const canChange = role === 'supervisor' || role === 'admin'
  const appUsers = useAppUsers()
  const confirm = useDeleteConfirm()
  const [header, setHeader] = useState(null)
  const productCustomer = useProductCustomerSupported() // 045: add-line parts filtered by the PO's customer
  const [lines, setLines] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [validity, setValidity] = useState({ valid_from: '', valid_to: '' })
  const [qtyEdit, setQtyEdit] = useState(null) // { line, value, unstarted }
  const [cancelFor, setCancelFor] = useState(null) // line
  const [historyFor, setHistoryFor] = useState(null) // { line, rows }
  const [newLine, setNewLine] = useState(null)

  const load = useCallback(async () => {
    try {
      const [h, statuses] = await Promise.all([getPoHeader(poId), listLineStatuses()])
      setHeader(h)
      setValidity({ valid_from: h.valid_from ?? '', valid_to: h.valid_to ?? '' })
      setLines(statuses.filter((l) => l.parent_po_id === poId))
    } catch (e) {
      setError(dbErrorMessage(e, 'Could not load the PO.'))
    }
  }, [poId])

  useEffect(() => {
    load()
  }, [load])

  async function refresh(message) {
    await load()
    onChanged?.()
    if (message) setNotice(message)
  }

  if (!header) return error ? <Banner tone="error" message={error} onClose={() => setError(null)} /> : null

  const customer = customers.find((c) => c.customer_id === header.customer_id)
  const today = formatLocalISODate(new Date())
  const expired = poExpired(header, today)
  const isOpen = header.po_status !== 'Closed'
  // order line fields (type, Deliver To, edit stamps) + the view's effective status / planned / despatched
  const lineRows = lines.map((l) => ({ ...(orderLines.find((o) => o.order_line_id === l.order_line_id) ?? {}), ...l }))

  async function saveValidity() {
    if (validity.valid_to && validity.valid_from && validity.valid_to < validity.valid_from) {
      setError('Valid To cannot be before Valid From.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updatePoHeader(poId, { valid_from: validity.valid_from || null, valid_to: validity.valid_to || null })
      await refresh('PO validity saved.')
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function askStatus(next) {
    confirm.ask({
      title: next === 'Closed' ? `Close PO ${header.po_number}?` : `Reopen PO ${header.po_number}?`,
      body:
        next === 'Closed'
          ? 'No new lines or planning on this PO until it is reopened. Existing PRDs, receipts and despatches are not affected.'
          : 'Lines can be added and planned again.',
      confirmLabel: next === 'Closed' ? 'Close PO' : 'Reopen PO',
      run: async () => {
        try {
          await updatePoHeader(poId, { po_status: next })
          await refresh(next === 'Closed' ? `PO ${header.po_number} closed.` : `PO ${header.po_number} reopened.`)
        } catch (e) {
          setError(dbErrorMessage(e))
        }
      },
    })
  }

  async function startQtyEdit(line) {
    setError(null)
    let unstarted = []
    try {
      const prds = await listPrdStatesForLine(line.order_line_id)
      unstarted = prds.filter((p) => prdState(p.stages, p.hasLogs) === 'unstarted').map((p) => p.prd_no)
    } catch {
      // hint only -- the DB guard still names them
    }
    setQtyEdit({ line, value: String(line.order_qty ?? ''), unstarted })
  }

  async function saveQty() {
    const { line, value, unstarted } = qtyEdit
    const problem = orderQtyProblem({ newQty: value, planned: line.planned_qty, unstartedPrds: unstarted })
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateLineQty(line.order_line_id, Number(value))
      setQtyEdit(null)
      await refresh(`${line.part_serial_number}: order qty ${fmtQtyIn(line.order_qty)} -> ${fmtQtyIn(value)}.`)
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function doCancel(reason) {
    const line = cancelFor
    let prds = []
    try {
      prds = (await listPrdStatesForLine(line.order_line_id)).map((p) => ({ prd_no: p.prd_no, state: prdState(p.stages, p.hasLogs) }))
    } catch {
      // the DB guard still checks
    }
    const problem = cancelLineProblem({ reason, prds, status: line.line_status })
    if (problem) return problem
    try {
      await cancelLine(line.order_line_id, reason)
    } catch (e) {
      return dbErrorMessage(e)
    }
    setCancelFor(null)
    await refresh(`${line.part_serial_number} line cancelled.`)
    return null
  }

  async function showHistory(line) {
    try {
      setHistoryFor({ line, rows: await listLineEdits(line.order_line_id) })
    } catch (e) {
      setError(dbErrorMessage(e))
    }
  }

  function startAddLine() {
    setError(null)
    setNewLine({ ...EMPTY_LINE, deliveryAddressId: String(defaultAddressId(delivery.addresses, header.customer_id) || '') })
  }

  async function saveNewLine() {
    const it = newLine
    if (!it.part) return setError('Pick the part for the new line.')
    const lineProblem = orderLineProblem({ orderQty: it.orderQty, poDate: header.po_date, expectedDelivery: it.expectedDelivery })
    if (lineProblem) return setError(lineProblem.error)
    const typeProblem = orderTypeProblem(it.orderType)
    if (typeProblem) return setError(typeProblem)
    const addrProblem = deliverToProblem({ supported: delivery.supported, addresses: delivery.addresses, customerId: header.customer_id, deliveryAddressId: it.deliveryAddressId })
    if (addrProblem) return setError(addrProblem)
    setBusy(true)
    setError(null)
    try {
      await createCustomerOrder(
        withTypedFields(
          {
            customer_id: header.customer_id,
            po_number: header.po_number,
            po_date: header.po_date,
            parent_po_id: header.id,
            part_serial_number: it.part,
            order_qty: it.orderQty,
            order_type: it.orderType,
            expected_delivery: it.expectedDelivery,
            customer_po_line_no: it.customerPoLineNo || null,
            ...(delivery.supported ? { delivery_address_id: deliveryIdOrNull(it.deliveryAddressId) } : {}),
          },
          { numeric: ['order_qty'], date: ['po_date', 'expected_delivery'] }
        )
      )
      setNewLine(null)
      await refresh(`Line ${it.part} added to PO ${header.po_number}.`)
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const setNL = (key) => (e) => setNewLine((l) => ({ ...l, [key]: e.target.value }))

  return (
    <div className="space-y-2" data-testid="po-view">
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} onClose={() => setNotice(null)} />}

      <FormSection icon={FileStack} title="1. PO Header" subtitle="Annual / open PO -- lines can be added and changed over the year">
        <Field label="Customer">
          <AutoFillBox value={customer?.customer_name ?? header.customer_id} />
        </Field>
        <Field label="PO Number">
          <AutoFillBox value={header.po_number} />
        </Field>
        <Field label="PO Date" width="short">
          <AutoFillBox value={header.po_date} />
        </Field>
        <Field name="po.valid_from" label="Valid From" width="short">
          <TextInput type="date" value={validity.valid_from} onChange={(e) => setValidity((v) => ({ ...v, valid_from: e.target.value }))} disabled={!canChange} />
        </Field>
        <Field name="po.valid_to" label="Valid To" width="short">
          <TextInput type="date" value={validity.valid_to} onChange={(e) => setValidity((v) => ({ ...v, valid_to: e.target.value }))} disabled={!canChange} />
        </Field>
        <Field label="PO Status" width="short">
          <div className="flex h-[30px] items-center">
            <StatusPill status={header.po_status} />
          </div>
        </Field>
        {canChange && (
          <div className="flex items-end gap-2">
            {(validity.valid_from !== (header.valid_from ?? '') || validity.valid_to !== (header.valid_to ?? '')) && (
              <button type="button" onClick={saveValidity} disabled={busy} className="rounded bg-bmlhblue px-3 py-1.5 text-xs text-white disabled:opacity-60">
                Save Validity
              </button>
            )}
            <button
              type="button"
              onClick={() => askStatus(isOpen ? 'Closed' : 'Open')}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-bmlhblue px-3 py-1.5 text-xs text-bmlhblue hover:bg-blue-50"
            >
              {isOpen ? <Lock size={13} /> : <Unlock size={13} />}
              {isOpen ? 'Close PO' : 'Reopen PO'}
            </button>
          </div>
        )}
        {expired && (
          <p className="basis-full rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" role="status">
            PO validity ended on {header.valid_to} -- {lineRows.filter((l) => l.line_status === 'Open').length} line(s) still open. Planning is still allowed.
          </p>
        )}
      </FormSection>

      <FormSection icon={ClipboardList} title="2. Line Items" subtitle="A line closes by itself when fully despatched">
        <div className="basis-full w-full overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#1F3A5F] text-left text-white">
                {['Part', 'Order Type', ...(delivery.supported ? ['Deliver To'] : []), 'Order Qty', 'Planned', 'Despatched', 'Status', 'Last Edit', ''].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-1.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-2 py-2 text-gray-500">No lines on this PO yet.</td>
                </tr>
              )}
              {lineRows.map((l) => {
                const source = l
                const editing = qtyEdit?.line.order_line_id === l.order_line_id
                return (
                  <tr key={l.order_line_id} className={`border-b ${l.line_status === 'Cancelled' ? 'text-gray-400' : ''}`} data-testid={`po-line-${l.order_line_id}`}>
                    <td className="px-2 py-1.5 font-medium">{l.part_serial_number}</td>
                    <td className="px-2 py-1.5">{source.order_type ?? ''}</td>
                    {delivery.supported && (
                      <td className="max-w-[180px] truncate px-2 py-1.5" title={deliveryText(source, delivery.byId)}>
                        {deliveryText(source, delivery.byId)}
                      </td>
                    )}
                    <td className="px-2 py-1.5">
                      {editing ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            aria-label="New order qty"
                            type="number"
                            value={qtyEdit.value}
                            onChange={(e) => setQtyEdit((q) => ({ ...q, value: e.target.value }))}
                            className="input-manual w-24 rounded border px-2 py-1 text-xs"
                          />
                          <span className="text-[11px] text-gray-500">min {fmtQtyIn(l.planned_qty)} (planned)</span>
                          <button type="button" onClick={saveQty} disabled={busy} className="rounded bg-bmlhblue px-2 py-1 text-white">Save</button>
                          <button type="button" onClick={() => setQtyEdit(null)} className="rounded border px-2 py-1">Back</button>
                        </span>
                      ) : (
                        fmtQtyIn(l.order_qty)
                      )}
                    </td>
                    <td className="px-2 py-1.5">{fmtQtyIn(l.planned_qty)}</td>
                    <td className="px-2 py-1.5">{fmtQtyIn(l.despatched_qty)}</td>
                    <td className="px-2 py-1.5"><StatusPill status={l.line_status} /></td>
                    <td className="px-2 py-1.5 text-[11px] text-gray-600">
                      {source.edited_at
                        ? `${userDisplayName(source.edited_by, appUsers)} · ${formatStamp(source.edited_at)} · was ${fmtQtyIn(source.previous_order_qty)}`
                        : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {canChange && l.line_status !== 'Cancelled' && !editing && (
                        <>
                          <button type="button" className="mr-3 inline-flex items-center gap-1 text-bmlhblue hover:underline" onClick={() => startQtyEdit(l)}>
                            <Pencil size={12} /> Edit qty
                          </button>
                          <button type="button" className="mr-3 inline-flex items-center gap-1 text-red-600 hover:underline" onClick={() => setCancelFor(l)}>
                            <XCircle size={12} /> Cancel line
                          </button>
                        </>
                      )}
                      <button type="button" className="inline-flex items-center gap-1 text-bmlhblue hover:underline" onClick={() => showHistory(l)}>
                        <History size={12} /> History
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {historyFor && (
          <div className="basis-full rounded border border-gray-200 bg-gray-50 p-2 text-xs" data-testid="line-history">
            <div className="mb-1 flex items-center justify-between font-semibold text-bmlhnavy">
              <span>Qty history -- {historyFor.line.part_serial_number}{historyFor.line.cancel_reason ? ` (cancelled: ${historyFor.line.cancel_reason})` : ''}</span>
              <button type="button" className="text-gray-500 hover:underline" onClick={() => setHistoryFor(null)}>Close</button>
            </div>
            {historyFor.rows.length === 0 ? (
              <p className="text-gray-500">No qty changes.</p>
            ) : (
              <ul className="space-y-0.5">
                {historyFor.rows.map((r) => (
                  <li key={r.id}>
                    {formatStamp(r.edited_at)} · {userDisplayName(r.edited_by, appUsers)} · {fmtQtyIn(r.old_qty)} → {fmtQtyIn(r.new_qty)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {newLine ? (
          <div className="basis-full flex flex-wrap items-start gap-3 rounded border border-gray-200 p-2" data-testid="add-line-form">
            <Field label="Part Serial Number" required width="medium">
              <SearchableSelect value={newLine.part} onChange={setNL('part')} options={productOptions(partsForCustomer(products, header.customer_id, newLine.part, { enabled: productCustomer }))} />
            </Field>
            <Field label="Order Type" required width="medium">
              <SelectInput value={newLine.orderType} onChange={setNL('orderType')} options={ORDER_TYPES} />
            </Field>
            {delivery.supported && (
              <Field label="Deliver To" width="medium" required={deliverToOptions(delivery.addresses, header.customer_id).length > 0}>
                <SearchableSelect value={newLine.deliveryAddressId} onChange={setNL('deliveryAddressId')} options={deliverToOptions(delivery.addresses, header.customer_id)} />
              </Field>
            )}
            <Field label="Order Qty" required width="short">
              <TextInput type="number" value={newLine.orderQty} onChange={setNL('orderQty')} />
            </Field>
            <Field label="Expected Delivery" width="short">
              <TextInput type="date" value={newLine.expectedDelivery} onChange={setNL('expectedDelivery')} />
            </Field>
            <Field label="PO Line No." width="short">
              <TextInput value={newLine.customerPoLineNo} onChange={setNL('customerPoLineNo')} />
            </Field>
            <div className="flex items-end gap-2 self-end">
              <button type="button" onClick={() => setNewLine(null)} className="rounded border px-3 py-1.5 text-xs">Back</button>
              <button type="button" onClick={saveNewLine} disabled={busy} className="rounded bg-bmlhblue px-3 py-1.5 text-xs text-white disabled:opacity-60">
                Save Line
              </button>
            </div>
          </div>
        ) : (
          isOpen && (
            <button type="button" onClick={startAddLine} className="inline-flex items-center gap-1 text-xs text-bmlhblue hover:underline">
              <Plus size={13} /> Add line
            </button>
          )
        )}
        {!isOpen && <p className="basis-full text-xs text-gray-500">PO is closed -- reopen it to add lines.</p>}
      </FormSection>

      {cancelFor && (
        <ReasonDialog
          title={`Cancel line ${cancelFor.part_serial_number}?`}
          note="The line stops counting as open and can't be planned. Finished pieces stay in FG stock. This can't be undone."
          confirmLabel="Cancel Line"
          onConfirm={doCancel}
          onCancel={() => setCancelFor(null)}
        />
      )}
      {confirm.dialog}
    </div>
  )
}
