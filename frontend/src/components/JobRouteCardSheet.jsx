import { useEffect, useState } from 'react'
import Banner from './Banner'
import { Printer, X } from 'lucide-react'
import StatusPill from './StatusPill'
import { getRouteCard, getStagesForPrd, stageReopenSupported, getStageReopenBlockers, reopenStage } from '../data/queries/routeCards'
import ConfirmDialog from './ConfirmDialog'
import { listAppUsers } from '../data/queries/appUsers'
import { userDisplayName } from '../utils/stockEdit'
import { dbErrorMessage } from '../utils/dbErrors'
import { stageLabel } from '../utils/stageLabel'
import { canReopenStage, reopenBlockedMessage, reopenReasonProblem, reopenedNote } from '../utils/stageReopen'
import { listOrdersByPrd } from '../data/queries/customerOrders'
import { listProducts } from '../data/queries/products'
import { listJobWorkTypes } from '../data/queries/jobWorkTypes'
import { listJobOrderStatus } from '../data/queries/jobOrders'
import { listMachines } from '../data/queries/machines'
import { listLogsForPrd } from '../data/queries/productionLogs'
import { orderLineProgress } from '../utils/batchSplit'
import { deliveryAddressesSupported, listDeliveryAddresses } from '../data/queries/deliveryAddresses'
import { addressMap, deliveryForLine, deliveryLabel } from '../utils/deliveryAddress'
import {
  JOB_ROUTE_CARD_COLUMNS,
  TEMPLATE_COLUMNS,
  BLANK_COLUMN_KEYS,
  ROUTE_CARD_VARIANTS,
  routeCardCell,
  buildJobRouteCardRows,
  printJobRouteCard,
} from '../utils/jobRouteCard'

const TEMPLATE_KEYS = new Set(TEMPLATE_COLUMNS.map((c) => c.key))

// 042: Deliver To for the header (hidden before 042; a failed read only blanks it).
async function deliveryHeader(order) {
  try {
    if (!(await deliveryAddressesSupported())) return { deliver_to: '', deliver_to_supported: false }
    const byId = addressMap(await listDeliveryAddresses())
    return { deliver_to: deliveryLabel(deliveryForLine(order, byId)), deliver_to_supported: true }
  } catch {
    return { deliver_to: '', deliver_to_supported: true }
  }
}

function InfoCell({ label, value }) {
  return (
    <>
      <div className="border-b border-r border-slate-400 bg-slate-100 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700">
        {label}
      </div>
      <div className="border-b border-r border-slate-400 px-2.5 py-1.5 text-[12.5px] text-slate-900">{value ?? ''}</div>
    </>
  )
}

/** The sheet itself (header block + stage table), shared by the on-screen
 * view and both print variants. blank: Date and Production Status cells are
 * left empty (headers and borders kept, taller rows) for the shop-floor copy. */
export function JobRouteCardBody({ header, rows, blank = false, statusExtra = null }) {
  return (
    <>
      <div className="flex items-center justify-between border border-b-0 border-slate-500 px-3 py-2">
        <h2 className="text-[16px] font-bold tracking-wide text-slate-900">JOB ROUTE CARD</h2>
        <span className="text-[13px] font-semibold text-slate-900">JC No: {header.jc_no || '—'}</span>
      </div>
      <div className="grid grid-cols-2 border-l border-t border-slate-400 md:grid-cols-6">
        <InfoCell label="PRD Number" value={header.prd_no} />
        <InfoCell label="Batch Qty" value={header.batch_qty} />
        <InfoCell label="PO Number" value={header.po_number} />
        <InfoCell label="Batch" value={header.batch} />
        <InfoCell label="Shift Hours" value={header.shift_hours} />
        <InfoCell label="Part Serial Number" value={header.part_serial_number} />
        <InfoCell label="Part Name" value={header.part_name} />
        <InfoCell label="Drawing Reference Number" value={header.part_drawing_reference_number} />
        <InfoCell label="Order Type" value={header.order_type} />
        {header.deliver_to_supported && <InfoCell label="Deliver To" value={header.deliver_to} />}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {JOB_ROUTE_CARD_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`border border-slate-400 px-2 py-1.5 text-left font-semibold text-slate-800 ${
                    TEMPLATE_KEYS.has(c.key) ? 'bg-[#FFF2B3]' : 'bg-slate-100'
                  } ${blank && c.key === 'date' ? 'w-[10%]' : ''} ${blank && c.key === 'status' ? 'w-[16%]' : ''}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={JOB_ROUTE_CARD_COLUMNS.length} className="border border-slate-400 px-2 py-3 text-center text-slate-500">
                  No stages on this route card.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                {JOB_ROUTE_CARD_COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className={`border border-slate-400 px-2 py-1.5 text-slate-900 ${TEMPLATE_KEYS.has(c.key) ? 'bg-[#FFF8D6]' : ''} ${blank ? 'h-9' : ''}`}
                  >
                    {blank && BLANK_COLUMN_KEYS.has(c.key) ? null : c.key === 'status' ? (
                      <>
                        <StatusPill status={r.status} />
                        {statusExtra?.(r)}
                      </>
                    ) : routeCardCell(r, c.key, blank)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Read-only Job Route Card for one PRD, laid out like BMLH's paper sheet.
 * The five template columns (from the PRD's frozen route card stages) are
 * pale yellow as on the sheet; Print opens a print-ready copy (Save as PDF).
 * Two variants (default Blank): "Blank – for shop floor" leaves Date and
 * Production Status empty; "With current status" fills them. The picker only
 * controls Print / PDF -- the on-screen sheet always shows dates + status. */
export default function JobRouteCardSheet({ prdNo, onClose, role }) {
  const [variant, setVariant] = useState('blank')
  const blank = variant === 'blank'
  const [header, setHeader] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 049: Reopen a Completed stage (supervisor / admin; hidden before 049).
  const [reopenSupported, setReopenSupported] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [checkingId, setCheckingId] = useState(null)
  const [blockedNotice, setBlockedNotice] = useState('')
  const [reopenRow, setReopenRow] = useState(null)
  const [reopenReason, setReopenReason] = useState('')
  const [reopenTouched, setReopenTouched] = useState(false)
  const [notice, setNotice] = useState('')
  const supervisor = role === 'supervisor' || role === 'admin'
  // Names for "Reopened by ..." -- loaded only when a stage was reopened.
  const [appUsers, setAppUsers] = useState([])
  const anyReopened = rows.some((r) => r.reopened_by)
  useEffect(() => {
    if (!anyReopened) return undefined
    let active = true
    listAppUsers().then((u) => active && setAppUsers(u ?? [])).catch(() => {})
    return () => {
      active = false
    }
  }, [anyReopened])

  useEffect(() => {
    if (!supervisor) return undefined
    let active = true
    stageReopenSupported().then((ok) => active && setReopenSupported(!!ok)).catch(() => {})
    return () => {
      active = false
    }
  }, [supervisor])

  async function askReopen(row) {
    setError(null)
    setCheckingId(row.id)
    try {
      const blockers = await getStageReopenBlockers(row.id)
      if (blockers.length) {
        setBlockedNotice(reopenBlockedMessage({ position: row.stage_no, seq: row.seq, operation: row.operation_name }, blockers))
        return
      }
      setReopenReason('')
      setReopenTouched(false)
      setReopenRow(row)
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setCheckingId(null)
    }
  }

  async function doReopen() {
    const row = reopenRow
    if (!row || reopenReasonProblem(reopenReason)) return
    try {
      await reopenStage(row.id, reopenReason)
      setNotice(`${stageLabel({ position: row.stage_no, seq: row.seq, operation: row.operation_name })} reopened -- it is Pending again.`)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setError(dbErrorMessage(e))
    }
  }

  function statusExtra(r) {
    const note = reopenedNote(r, (id) => userDisplayName(id, appUsers))
    const showButton = canReopenStage({ role, supported: reopenSupported, stageStatus: r.stage_status })
    if (!note && !showButton) return null
    return (
      <>
        {showButton && (
          <button
            type="button"
            onClick={() => askReopen(r)}
            disabled={checkingId != null}
            className="ml-2 rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            aria-label={`Reopen stage ${r.stage_no}`}
          >
            {checkingId === r.id ? 'Checking...' : 'Reopen'}
          </button>
        )}
        {note && <span className="mt-0.5 block text-[10.5px] text-amber-700" data-testid={`reopened-note-${r.id}`}>{note}</span>}
      </>
    )
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [card, stages, orders, products, jobWorkTypes, dispatches, machines, logs] = await Promise.all([
          getRouteCard(prdNo),
          getStagesForPrd(prdNo),
          listOrdersByPrd(),
          listProducts(),
          listJobWorkTypes(),
          listJobOrderStatus(), // per DC with qty_received -> outsourced stage progress
          listMachines(),
          listLogsForPrd(prdNo),
        ])
        if (cancelled) return
        const order = orders.find((o) => o.prd_no === prdNo)
        const product = products.find((p) => p.part_serial_number === order?.part_serial_number)
        setHeader({
          jc_no: card.jc_no ?? '',
          prd_no: prdNo,
          // This PRD's qty (030); the card's own batch_qty is informational only.
          batch_qty: order?.prd_qty ?? card.batch_qty ?? '',
          shift_hours: card.shift_hours ?? '',
          part_serial_number: order?.part_serial_number ?? '',
          part_name: product?.part_name ?? '',
          part_drawing_reference_number: product?.part_drawing_reference_number ?? '',
          // 030: PO line + which batch of it this PRD is
          po_number: order?.po_number ?? '',
          batch: order ? `Batch ${order.batch_no} (PO line: ${orderLineProgress(order)})` : '',
          order_type: order?.order_type ?? '',
          ...(await deliveryHeader(order)),
        })
        setRows(buildJobRouteCardRows({ card, stages, jobWorkTypes, dispatches, machines, logs }))
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [prdNo, reloadKey])

  return (
    <section className="rounded-xl border border-[#D5E3F4] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[#D5E3F4] px-4 py-2">
        <span className="text-[13px] font-semibold text-[#0B2A5B]">Job Route Card · {prdNo}</span>
        <div className="flex items-center gap-2">
          <select
            aria-label="Route card print variant"
            title="Print / PDF copy"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            className="h-8 rounded-lg border border-[#A9C6EE] bg-white px-2 text-[13px] text-[#0B2A5B]"
          >
            {ROUTE_CARD_VARIANTS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A9C6EE] bg-[#E6F0FD] px-3 text-[13px] font-medium text-[#0B2A5B] hover:bg-[#D6E6FB] disabled:opacity-60"
            disabled={!header}
            onClick={() => printJobRouteCard({ header, rows, blank })}
          >
            <Printer size={15} /> Print / PDF
          </button>
          {onClose && (
            <button
              type="button"
              aria-label="Close route card"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {error && <Banner tone="error" message={error} className="m-3" onClose={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} onClose={() => setNotice('')} />}
      {loading && <div className="px-4 py-3 text-sm text-slate-500">Loading route card...</div>}

      {!loading && header && (
        <div className="p-3">
          {/* On screen always with dates + status (progress check); the picker only sets the print copy. */}
          <JobRouteCardBody header={header} rows={rows} statusExtra={statusExtra} />
        </div>
      )}

      <ConfirmDialog
        open={!!blockedNotice}
        tone="notice"
        hideCancel
        title="Can't reopen this stage"
        body={blockedNotice}
        confirmLabel="OK"
        onConfirm={() => {}}
        onClose={() => setBlockedNotice('')}
      />
      <ConfirmDialog
        open={!!reopenRow}
        tone="notice"
        title="Reopen stage?"
        body={reopenRow ? `${stageLabel({ position: reopenRow.stage_no, seq: reopenRow.seq, operation: reopenRow.operation_name })} of ${prdNo} goes back to Pending and its completion date is cleared. Production can then continue on it.` : ''}
        confirmLabel="Reopen stage"
        confirmDisabled={!!reopenReasonProblem(reopenReason)}
        onConfirm={doReopen}
        onClose={() => setReopenRow(null)}
      >
        <label className="block text-xs font-medium text-gray-700">
          Reason <span className="text-red-600">*</span>
          <textarea
            aria-label="Reopen reason"
            rows={2}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            onBlur={() => setReopenTouched(true)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
          />
        </label>
        {reopenTouched && reopenReasonProblem(reopenReason) && (
          <p className="mt-1 text-[11px] text-red-600">{reopenReasonProblem(reopenReason)}</p>
        )}
      </ConfirmDialog>
    </section>
  )
}
