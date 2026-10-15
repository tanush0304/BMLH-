// Pure logic for the R4 reports: Customer Order Status and Job Order Status.

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------- Customer orders

/** Order lines with dispatched qty (FG Dispatch up to To) and status:
 * Closed when dispatched >= order qty, else Open. */
export function orderLines(orders, dispatchedByPrd) {
  return orders.map((o) => {
    const dispatched = num(dispatchedByPrd.get(o.prd_no))
    const orderQty = num(o.order_qty)
    return { ...o, order_qty: orderQty, dispatched, status: dispatched >= orderQty && orderQty > 0 ? 'Closed' : 'Open' }
  })
}

/** A PO = customer + PO number; Closed only when every line is Closed. */
export function poSummary(lines) {
  const pos = new Map()
  for (const l of lines) {
    const k = `${l.customer_id}|${l.po_number}`
    const p = pos.get(k) ?? { key: k, qty: 0, closed: true }
    p.qty += l.order_qty
    p.closed = p.closed && l.status === 'Closed'
    pos.set(k, p)
  }
  const list = [...pos.values()]
  const open = list.filter((p) => !p.closed)
  const closed = list.filter((p) => p.closed)
  return {
    total: list.length,
    open: open.length,
    openQty: open.reduce((a, p) => a + p.qty, 0),
    closed: closed.length,
    closedQty: closed.reduce((a, p) => a + p.qty, 0),
  }
}

/** "2026-09" months from..to inclusive. */
export function monthsBetween(from, to) {
  const out = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (ym) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

/** Monthly PO qty (by PO date) vs dispatched (by dispatch date), for the given lines. */
export function monthlyPoVsDispatch(lines, dispatches, months) {
  const prds = new Set(lines.map((l) => l.prd_no))
  const po = new Map()
  const disp = new Map()
  for (const l of lines) if (l.po_date) po.set(l.po_date.slice(0, 7), (po.get(l.po_date.slice(0, 7)) ?? 0) + l.order_qty)
  for (const d of dispatches) {
    if (!prds.has(d.prd_no) || !d.transaction_date) continue
    disp.set(d.transaction_date.slice(0, 7), (disp.get(d.transaction_date.slice(0, 7)) ?? 0) + num(d.qty))
  }
  return months.map((m) => ({ month: m, label: monthLabel(m), po: po.get(m) ?? 0, dispatched: disp.get(m) ?? 0 }))
}

// ---------------------------------------------------------------- Job orders

// DC status comes from "job order status" (migration 031):
// Sent / Partially Received / Received / Closed Short. Overdue is a separate
// flag (open DC past its expected receipt date), not a status.
export const DC_CLOSED_STATUSES = ['Received', 'Closed Short']

export const isDcClosed = (row) => DC_CLOSED_STATUSES.includes(row.status)

/** Open DC whose expected receipt date is before today (due today = not
 * yet overdue). Uses the view's is_overdue when present. */
export function isDcOverdue(row, today) {
  if (row.is_overdue != null) return Boolean(row.is_overdue)
  return !isDcClosed(row) && Boolean(row.expected_receipt_date) && row.expected_receipt_date < today
}

/** One row per DC with received, pending (balance still out on an open DC)
 * and short qty (sent - received on a Closed Short DC). */
export function jobOrderRows(rows, today) {
  return rows.map((r) => {
    const qty = num(r.qty)
    const received = num(r.qty_received)
    const closed = isDcClosed(r)
    return {
      ...r,
      qty,
      received,
      overdue: isDcOverdue(r, today),
      pending: closed ? 0 : Math.max(0, qty - received),
      short_qty: r.status === 'Closed Short' ? Math.max(0, qty - received) : 0,
    }
  })
}

/** Counts and % per status; "closed" = Received + Closed Short, "pending" =
 * DCs still out (Sent + Partially Received), overdue = open and late. */
export function jobOrderCounts(rows) {
  const total = rows.length
  const count = (s) => rows.filter((r) => r.status === s).length
  const pct = (n) => (total > 0 ? Math.round((1000 * n) / total) / 10 : null)
  const received = count('Received')
  const closedShort = count('Closed Short')
  const partial = count('Partially Received')
  const sent = count('Sent')
  const closed = received + closedShort
  const pending = partial + sent
  const overdue = rows.filter((r) => r.overdue).length
  return { total, received, closedShort, partial, sent, closed, pending, overdue, closedPct: pct(closed), pendingPct: pct(pending), overduePct: pct(overdue) }
}

/** "300 of 500 back" for an outsourced stage row of "jobwork stage status". */
export function stageBackText(stage) {
  if (!stage || num(stage.dc_count) === 0) return 'Not sent'
  return `${num(stage.received_qty).toLocaleString('en-IN')} of ${num(stage.sent_qty).toLocaleString('en-IN')} back`
}
