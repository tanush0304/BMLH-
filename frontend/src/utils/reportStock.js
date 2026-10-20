// Pure stock-movement logic for the R3 reports (WIP, FG Inventory, Raw
// Material), from the transaction ledgers.
//   opening  = master opening + in - out before `from`
//   receipts = in  within from..to        issues = out within from..to
//   closing  = opening + receipts - issues   (= balance as of `to`)
// Transactions after `to` are ignored, so a past period shows the stock as
// it was then.
import { groupBy, round1 } from './reportAggregates'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Movement per key.
 *   txns:     ledger rows with transaction_type, qty, transaction_date
 *   keyFn:    row -> group key
 *   inType / outType: transaction_type values for in / out
 *   openingFor(key) -> master opening stock (default 0)
 * Returns Map(key -> { opening, receipts, issues, closing, lastReceipt, lastIssue })
 * (lastReceipt / lastIssue = latest date in the period, or null).
 */
export function stockMovement(txns, { from, to, keyFn, inType, outType, openingFor = () => 0 }) {
  const out = new Map()
  const get = (k) => {
    if (!out.has(k)) out.set(k, { opening: num(openingFor(k)), receipts: 0, issues: 0, closing: 0, lastReceipt: null, lastIssue: null })
    return out.get(k)
  }
  for (const t of txns) {
    const d = t.transaction_date
    if (!d || d > to) continue
    const isIn = t.transaction_type === inType
    const isOut = t.transaction_type === outType
    if (!isIn && !isOut) continue
    const m = get(keyFn(t))
    const q = num(t.qty)
    if (d < from) {
      m.opening += isIn ? q : -q
    } else if (isIn) {
      m.receipts += q
      if (!m.lastReceipt || d > m.lastReceipt) m.lastReceipt = d
    } else {
      m.issues += q
      if (!m.lastIssue || d > m.lastIssue) m.lastIssue = d
    }
  }
  for (const m of out.values()) m.closing = m.opening + m.receipts - m.issues
  return out
}

/** Total balance (all keys) at the end of each day: [{ date, balance }]. */
export function dailyBalance(txns, { days, inType, outType, openingTotal = 0 }) {
  if (days.length === 0) return []
  const deltaByDate = new Map()
  let balance = num(openingTotal)
  for (const t of txns) {
    const sign = t.transaction_type === inType ? 1 : t.transaction_type === outType ? -1 : 0
    if (!sign || !t.transaction_date) continue
    if (t.transaction_date < days[0]) balance += sign * num(t.qty)
    else deltaByDate.set(t.transaction_date, (deltaByDate.get(t.transaction_date) ?? 0) + sign * num(t.qty))
  }
  return days.map((date) => {
    balance += deltaByDate.get(date) ?? 0
    return { date, balance }
  })
}

/** Per-day in / out sums plus end-of-day balance: [{ date, receipts, issues, balance }]. */
export function dailyMovement(txns, { days, inType, outType, openingTotal = 0 }) {
  const balances = dailyBalance(txns, { days, inType, outType, openingTotal })
  const byDate = groupBy(txns, (t) => t.transaction_date)
  return balances.map(({ date, balance }) => {
    let receipts = 0
    let issues = 0
    for (const t of byDate.get(date) ?? []) {
      if (t.transaction_type === inType) receipts += num(t.qty)
      else if (t.transaction_type === outType) issues += num(t.qty)
    }
    return { date, receipts, issues, balance }
  })
}

/** Top `n` by value, rest summed into "Others": [{ label, value }]. */
export function topN(entries, n, othersLabel = 'Others') {
  const sorted = [...entries].filter((e) => e.value > 0).sort((a, b) => b.value - a.value)
  if (sorted.length <= n) return sorted
  const rest = sorted.slice(n).reduce((a, e) => a + e.value, 0)
  return [...sorted.slice(0, n), { label: othersLabel, value: rest }]
}

/** Sum a field per unit of measurement: [{ uom, value }] sorted by value desc
 * (quantities in different UoMs are never added together). */
export function sumByUom(rows, field, uomKey = 'unit_of_measurement') {
  const map = new Map()
  for (const r of rows) {
    const u = r[uomKey] || '—'
    map.set(u, (map.get(u) ?? 0) + num(r[field]))
  }
  return [...map].map(([uom, value]) => ({ uom, value: round1(value) })).sort((a, b) => b.value - a.value)
}

/** The UoM with the largest row count (default for RM charts). */
export function dominantUom(rows, uomKey = 'unit_of_measurement') {
  const counts = new Map()
  for (const r of rows) counts.set(r[uomKey] || '—', (counts.get(r[uomKey] || '—') ?? 0) + 1)
  let best = null
  for (const [u, c] of counts) if (!best || c > best[1]) best = [u, c]
  return best ? best[0] : null
}

/**
 * FG Inventory "Order Fulfilment (by qty)" donut, per PO line (030: a line's
 * PRDs together fill its order qty). For the lines in `lineIds`, summed over
 * ALL their PRDs, with `txns` = FG transactions up to the report's To:
 *   dispatched    = dispatched so far
 *   inStock       = received - dispatched (still in FG)
 *   yetToProduce  = line order qty - received, never below 0
 * `master` rows ("finished goods master") give prd_no -> order_line_id and
 * the line's order_quantity.
 */
export function orderFulfilment(master, txns, lineIds, { inType, outType }) {
  const lineOfPrd = new Map()
  const lineQty = new Map()
  for (const m of master) {
    if (!lineIds.has(m.order_line_id)) continue
    lineOfPrd.set(m.prd_no, m.order_line_id)
    lineQty.set(m.order_line_id, Number(m.order_quantity) || 0)
  }
  const received = new Map()
  let dispatched = 0
  let receivedTotal = 0
  for (const t of txns) {
    const line = lineOfPrd.get(t.prd_no)
    if (line == null) continue
    const qty = Number(t.qty) || 0
    if (t.transaction_type === inType) {
      received.set(line, (received.get(line) ?? 0) + qty)
      receivedTotal += qty
    } else if (t.transaction_type === outType) dispatched += qty
  }
  let yetToProduce = 0
  for (const [line, qty] of lineQty) yetToProduce += Math.max(0, qty - (received.get(line) ?? 0))
  const inStock = receivedTotal - dispatched
  return { dispatched, inStock, yetToProduce, total: dispatched + inStock + yetToProduce }
}

/** Raw Material Status filters on one RM (an RM Master row): every set
 * filter must match -- Supplier (one of its linked suppliers), RM Type, UOM,
 * RM Code. Blank filters are ignored. */
export function rmMatchesFilters(rm, { supplier, rmType, uom, rmCode } = {}) {
  if (supplier && !(rm.supplier_names ?? '').split(', ').includes(supplier)) return false
  if (rmType && rm.rm_type !== rmType) return false
  if (uom && rm.unit_of_measurement !== uom) return false
  if (rmCode && rm.raw_material_code !== rmCode) return false
  return true
}
