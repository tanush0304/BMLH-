// Production Planning batch split (migration 030): one PRD per batch.
// Defaults (senior answers pending): max batch size per PRD from Production
// Batch Master, last batch = remainder; no batch size -> one PRD for the
// whole remaining qty. The planner may edit the split and plan only some
// batches now (ticked); the rest stay on the line for later.

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
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
 * qty. errors block Save; warnings (batch above the master size) do not. */
export function validateSplit(rows, remaining, batchSize) {
  const errors = []
  const warnings = []
  const total = rows.reduce((a, r) => a + num(r.qty), 0)
  if (rows.length === 0) errors.push('Add at least one batch.')
  if (rows.some((r) => !(num(r.qty) > 0))) errors.push('Every batch qty must be greater than 0.')
  if (total !== num(remaining)) errors.push(`Batches total ${total} but ${num(remaining)} is left to plan on this PO line.`)
  if (!rows.some((r) => r.plan)) errors.push('Tick at least one batch to plan now.')
  const size = num(batchSize)
  if (size > 0) {
    const over = rows.filter((r) => num(r.qty) > size).map((r) => num(r.qty))
    if (over.length) warnings.push(`Batch ${over.join(', ')} is above the Production Batch Master size (${size}).`)
  }
  const planned = rows.filter((r) => r.plan).map((r) => num(r.qty))
  return { errors, warnings, total, planned, plannedTotal: planned.reduce((a, b) => a + b, 0) }
}
