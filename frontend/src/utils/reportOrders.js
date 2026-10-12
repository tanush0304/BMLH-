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

/** Closed = received; Overdue = not received and expected receipt date
 * before today; otherwise Open (sent, still within lead time). */
export function jobOrderStatus(row, today) {
  if (row.receipt_date || row.qty_received != null) return 'Closed'
  if (row.expected_receipt_date && row.expected_receipt_date < today) return 'Overdue'
  return 'Open'
}

/** Job order rows enriched with status, pending qty and lead times. */
export function jobOrderRows(rows, today) {
  return rows.map((r) => {
    const status = jobOrderStatus(r, today)
    const qty = num(r.qty)
    return {
      ...r,
      qty,
      status,
      pending: status === 'Closed' ? Math.max(0, qty - num(r.qty_received)) : qty,
    }
  })
}

/** Counts and % per status. */
export function jobOrderCounts(rows) {
  const total = rows.length
  const count = (s) => rows.filter((r) => r.status === s).length
  const pct = (n) => (total > 0 ? Math.round((1000 * n) / total) / 10 : null)
  const closed = count('Closed')
  const open = count('Open')
  const overdue = count('Overdue')
  return { total, closed, open, overdue, pending: open + overdue, closedPct: pct(closed), pendingPct: pct(open + overdue), overduePct: pct(overdue) }
}
