// Phase D (043): annual / open PO -- pure rules shared by New Order,
// Planning, reports and the alert bell. Mirrors the 043 DB guards.

export const LINE_STATUSES = ['Open', 'Closed', 'Cancelled']
export const PO_STATUSES = ['Open', 'Closed']

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Indian digit grouping, same as the DB's fmt_qty_in: 100000 -> 1,00,000. */
export function fmtQtyIn(value) {
  const n = num(value)
  const neg = n < 0
  const [int, frac] = String(Math.abs(n)).split('.')
  let grouped = int
  if (int.length > 3) {
    const head = int.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ',')
    grouped = `${head},${int.slice(-3)}`
  }
  return `${neg ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`
}

/** Effective line status (view "customer order line status"): Cancelled when
 * stored so; Closed when despatched >= order qty (> 0); else Open. */
export function effectiveLineStatus({ stored, orderQty, despatched }) {
  if (stored === 'Cancelled') return 'Cancelled'
  const q = num(orderQty)
  return q > 0 && num(despatched) >= q ? 'Closed' : 'Open'
}

/** Despatched qty per PO line from FG transactions (Dispatch, not voided)
 * and PRD rows ({ prd_no, order_line_id }). */
export function despatchedByLine(fgTransactions, prdRows) {
  const lineOfPrd = new Map((prdRows ?? []).map((p) => [p.prd_no, p.order_line_id]))
  const out = new Map()
  for (const t of fgTransactions ?? []) {
    if (t.transaction_type !== 'Dispatch' || t.voided_at) continue
    const line = lineOfPrd.get(t.prd_no)
    if (line == null) continue
    out.set(line, (out.get(line) ?? 0) + num(t.qty))
  }
  return out
}

/** PRD state from its stages + whether it has production logs:
 * unstarted (all Pending, no log) / in_production / finished. */
export function prdState(stages = [], hasLogs = false) {
  const started = hasLogs || stages.some((s) => s.status !== 'Pending')
  if (!started) return 'unstarted'
  if (stages.some((s) => s.status !== 'Completed' && s.status !== 'Received')) return 'in_production'
  return 'finished'
}

/** Order qty change: up always; down only to planned. Returns the message
 * (same wording as the DB) or null. `unstartedPrds` = PRD numbers. */
export function orderQtyProblem({ newQty, planned = 0, unstartedPrds = [] }) {
  const raw = String(newQty ?? '').trim()
  const q = Number(raw)
  if (raw === '' || !Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) return 'Order qty must be a whole number greater than 0.'
  if (q < num(planned)) {
    const ids = [...unstartedPrds].sort((x, y) => x.localeCompare(y, undefined, { numeric: true })) // same order as the DB
    const tail = ids.length ? `, or cancel unstarted PRDs (${ids.join(', ')}) first.` : '.'
    return `Already planned ${fmtQtyIn(planned)} -- reduce to at least ${fmtQtyIn(planned)}${tail}`
  }
  return null
}

/** Cancel a line: reason required; refused while PRDs are unstarted (cancel
 * them first) or still in production. prds = [{ prd_no, state }]. */
export function cancelLineProblem({ reason, prds = [], status }) {
  if (status === 'Cancelled') return 'This PO line is already cancelled.'
  if (!String(reason ?? '').trim()) return 'A reason is required to cancel a PO line.'
  const ids = (state) => prds.filter((p) => p.state === state).map((p) => p.prd_no).sort()
  const unstarted = ids('unstarted')
  const running = ids('in_production')
  if (!unstarted.length && !running.length) return null
  const parts = []
  if (unstarted.length) parts.push(`cancel unstarted PRDs (${unstarted.join(', ')}) in Production Planning first`)
  if (running.length) parts.push(`PRDs still in production (${running.join(', ')}) -- finish them first`)
  return `Cannot cancel this PO line: ${parts.join('; ')}`
}

/** Valid To has passed (strictly before today, ISO dates). */
export function poExpired(header, today) {
  return Boolean(header?.valid_to) && header.po_status !== 'Closed' && String(header.valid_to) < String(today)
}

/** Planning offers a line only when it is effectively Open and its PO (if
 * any) is Open. */
export function planningLineAllowed(lineStatus, header) {
  if (lineStatus !== 'Open') return false
  return !header || header.po_status !== 'Closed'
}

/** Customer Order Status rows: PO date in the period, plus every line
 * still Open dated on/before To (open annual POs never drop out). */
export function reportLineIncluded(line, { from, to }) {
  const d = line.po_date ? String(line.po_date) : ''
  if (d && d >= from && d <= to) return true
  return line.line_status === 'Open' && (!d || d <= to)
}

/** PO KPIs by the header's own status; cancelled lines counted apart and
 * left out of the qty totals. */
export function poStatusCounts(headers = [], lines = []) {
  const ids = new Set(lines.map((l) => l.parent_po_id).filter((id) => id != null))
  const shown = headers.filter((h) => ids.has(h.id))
  const open = shown.filter((h) => h.po_status !== 'Closed')
  const closed = shown.filter((h) => h.po_status === 'Closed')
  const live = lines.filter((l) => l.line_status !== 'Cancelled')
  const qtyOf = (set) => {
    const keep = new Set(set.map((h) => h.id))
    return live.filter((l) => keep.has(l.parent_po_id)).reduce((a, l) => a + num(l.order_qty), 0)
  }
  return {
    total: shown.length,
    open: open.length,
    closed: closed.length,
    openQty: qtyOf(open),
    closedQty: qtyOf(closed),
    cancelledLines: lines.filter((l) => l.line_status === 'Cancelled').length,
    openLines: lines.filter((l) => l.line_status === 'Open').length,
    closedLines: lines.filter((l) => l.line_status === 'Closed').length,
  }
}

const ddmmyyyy = (iso) => {
  const [y, m, d] = String(iso ?? '').slice(0, 10).split('-')
  return y && m && d ? `${d}-${m}-${y}` : String(iso ?? '')
}

/** Bell items: Open POs past Valid To with open lines. */
export function expiredPoItems({ headers = [], lineStatuses = [], today }) {
  const openLines = new Map()
  for (const l of lineStatuses) {
    if (l.line_status === 'Open' && l.parent_po_id != null) openLines.set(l.parent_po_id, (openLines.get(l.parent_po_id) ?? 0) + 1)
  }
  return headers
    .filter((h) => poExpired(h, today) && (openLines.get(h.id) ?? 0) > 0)
    .sort((a, b) => String(a.valid_to).localeCompare(String(b.valid_to)))
    .map((h) => {
      const n = openLines.get(h.id)
      return {
        id: `po:${h.id}`,
        text: `PO ${h.po_number} validity ended on ${ddmmyyyy(h.valid_to)} -- ${n} line${n === 1 ? '' : 's'} still open`,
        open: { topKey: 'customer-order', subKey: 'order', mode: `po:${h.id}` },
      }
    })
}

/** PO header id from a New Order open mode ("po:12"), else null. */
export function poFromMode(mode) {
  if (typeof mode !== 'string' || !mode.startsWith('po:')) return null
  const n = Number(mode.slice(3))
  return Number.isFinite(n) ? n : null
}
