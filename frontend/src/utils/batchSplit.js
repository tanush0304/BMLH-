// Production Planning batch split (migration 030): one PRD per batch.
// Max batch size per PRD from Production Batch Master, last batch =
// remainder; no batch size -> one PRD for the whole remaining qty, no limit.
// A batch above the master size is BLOCKED (senior decision, 038 enforces it
// in plan_production_orders too). The planner may edit the split and plan
// only some batches now (ticked); the rest stay on the line for later.

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** The part's batch size: the SMALLEST positive production_batch_quantity
 * of its batch master rows (same rule as 038), or null when it has none. */
export function masterBatchSizeFor(batchMasterRows, partSerialNumber) {
  const sizes = (batchMasterRows ?? [])
    .filter((b) => partSerialNumber && b.part_serial_number === partSerialNumber)
    .map((b) => num(b.production_batch_quantity))
    .filter((n) => n > 0)
  return sizes.length ? Math.min(...sizes) : null
}

/** Message for a batch above the master size (row error + Save blocked). */
export function batchTooLargeMessage(partSerialNumber, batchSize) {
  return `Max batch size for ${partSerialNumber} is ${num(batchSize)} — split into another batch or update the Production Batch Master`
}

/** Suggested batch quantities for `remaining` with a max of `batchSize`:
 * 1600 / 500 -> [500, 500, 500, 100]. */
export function suggestSplit(remaining, batchSize) {
  const total = num(remaining)
  const size = num(batchSize)
  if (total <= 0) return []
  if (size <= 0) return [total]
  const out = []
  for (let left = total; left > 0; left -= size) out.push(Math.min(size, left))
  return out
}

/** Checks the planner's rows ([{ qty, plan }]) against the line's remaining
 * qty and the master batch size. Every error blocks Save. rowErrors[i] is
 * the message for row i when its qty is above the batch size -- checked on
 * EVERY row, ticked or not. No batch size -> no limit. */
export function validateSplit(rows, remaining, batchSize, partSerialNumber = '') {
  const errors = []
  const total = rows.reduce((a, r) => a + num(r.qty), 0)
  if (rows.length === 0) errors.push('Add at least one batch.')
  if (rows.some((r) => !(num(r.qty) > 0))) errors.push('Every batch qty must be greater than 0.')
  if (total !== num(remaining)) errors.push(`Batches total ${total} but ${num(remaining)} is left to plan on this PO line.`)
  if (!rows.some((r) => r.plan)) errors.push('Tick at least one batch to plan now.')
  const size = num(batchSize)
  const tooLarge = batchTooLargeMessage(partSerialNumber, size)
  const rowErrors = rows.map((r) => (size > 0 && num(r.qty) > size ? tooLarge : null))
  if (rowErrors.some(Boolean)) errors.push(tooLarge)
  const planned = rows.filter((r) => r.plan).map((r) => num(r.qty))
  return { errors, rowErrors, total, planned, plannedTotal: planned.reduce((a, b) => a + b, 0) }
}

/** PO line progress for a PRD's batch label: active PRDs, cancelled ones
 * (only when any) and qty planned -> "3 active · 1 cancelled · 200 of 1600
 * planned". batch_no is never re-used after a cancel, so it is shown on its
 * own ("Batch 4") instead of "n of N". */
export function lineProgressLabel({ activeCount, cancelledCount, plannedQty, orderQty }) {
  const parts = [`${num(activeCount)} active`]
  if (num(cancelledCount) > 0) parts.push(`${num(cancelledCount)} cancelled`)
  parts.push(`${num(plannedQty)} of ${num(orderQty)} planned`)
  return parts.join(' · ')
}

/** lineProgressLabel for a listOrdersByPrd() row. */
export function orderLineProgress(order) {
  return lineProgressLabel({
    activeCount: order.line_active_count,
    cancelledCount: order.line_cancelled_count,
    plannedQty: order.line_planned_qty,
    orderQty: order.order_qty,
  })
}
