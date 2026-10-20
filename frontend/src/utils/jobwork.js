import { displayStatus } from './statusLabels'

// Jobwork (outsourced) DC helpers -- migration 031: a DC can have several
// receipts and a stage several DCs. The database enforces the same limits;
// these give the screens an early, clear message.

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Balance still out on a DC row of "job order status". */
export function dcBalance(row) {
  return Math.max(0, num(row?.qty) - num(row?.qty_received))
}

/** null when the receipt qty is OK, otherwise the message. */
export function receiptQtyError(qty, row) {
  const n = Number(qty)
  if (!Number.isFinite(n) || n <= 0) return 'Qty Received must be a number greater than zero.'
  const balance = dcBalance(row)
  if (n > balance) return `Qty Received (${n}) is more than the balance on ${row?.dc_no} (${balance}).`
  return null
}

/** null when a close-short reason is given, otherwise the message. */
export function closeShortReasonError(reason) {
  return reason?.trim() ? null : 'Enter a reason to close this DC short.'
}

/** Picker label for an open DC: "DC-004 · Vendor A · 200 of 300 to come". */
export function openDcLabel(row, vendorName) {
  const parts = [row.dc_no]
  if (vendorName) parts.push(vendorName)
  parts.push(`${dcBalance(row)} of ${num(row.qty)} to come`)
  return parts.join(' · ')
}

// ---- Edit (migration 033): supervisor/admin, open DCs only -------------

/** Why this DC can't be edited (Received / Closed Short), or null. */
export function dcEditBlockReason(row) {
  if (!row) return 'Pick a DC in the list first.'
  if (row.voided_at) return `${row.dc_no} is void and can no longer be edited.`
  if (row.is_open && !row.closed_short_at) return null
  const status = displayStatus(row.closed_short_at ? 'Closed Short' : 'Received')
  return `${row.dc_no} is ${status} -- a closed DC can no longer be edited.`
}

/** Why this receipt can't be edited (its DC is closed), or null. */
export function receiptEditBlockReason(receipt, dc) {
  if (!receipt) return 'Pick a receipt in the list first.'
  if (!dc || !dc.is_open || dc.closed_short_at) {
    return `${receipt.receipt_no} is on a closed DC (${displayStatus(dc?.status) ?? 'closed'}) -- it can no longer be edited.`
  }
  return null
}

/** Dispatch edit limits: min = received on the DC, max = what the stage can
 * still send + this DC's current qty (same as the DB, 033). `stageAvailable`
 * is computeStageAvailability for the DC's stage (null while loading). */
export function dispatchEditLimits(row, stageAvailable) {
  const min = num(row?.qty_received)
  const max = stageAvailable === null || stageAvailable === undefined ? null : Math.max(0, num(stageAvailable)) + num(row?.qty)
  return { min, max }
}

export function dispatchLimitText({ min, max }) {
  return `min ${min} (received)${max === null ? '' : ` · max ${max} (available)`}`
}

/** The vendor can change only while nothing has come back on the DC. */
export function vendorLocked(row) {
  return num(row?.qty_received) > 0
}

/** null when the dispatch edit is OK, otherwise the message. */
export function dispatchEditError(draft, row, limits) {
  const qty = Number(draft.qty)
  if (draft.qty === '' || !Number.isFinite(qty) || qty <= 0) return 'Qty must be a number greater than zero.'
  if (qty < limits.min) return `Qty (${qty}) cannot be less than the qty already received on ${row.dc_no} (${limits.min}).`
  if (limits.max !== null && qty > limits.max) return `Qty (${qty}) is more than the qty available for this stage (max ${limits.max}).`
  if (!draft.dispatch_date) return 'Despatch Date is required.'
  if (!draft.vendor_id) return 'Vendor is required.'
  if (vendorLocked(row) && draft.vendor_id !== row.vendor_id) return 'Vendor cannot be changed once pieces have been received on this DC.'
  return null
}

/** ONLY the editable dispatch fields -- never expected_receipt_date (the DB
 * recomputes it), is_open, updated_at or audit columns. Vendor is left out
 * once anything has been received. */
export function dispatchEditPatch(draft, row) {
  const patch = { qty: Number(draft.qty), dispatch_date: draft.dispatch_date || null }
  if (!vendorLocked(row)) patch.vendor_id = draft.vendor_id || null
  return patch
}

/** Receipt edit max = DC balance + this receipt's current qty. */
export function receiptEditMax(receipt, dc) {
  return dcBalance(dc) + num(receipt?.qty_received)
}

/** null when the receipt edit is OK, otherwise the message. */
export function receiptEditError(draft, receipt, dc) {
  const qty = Number(draft.qty_received)
  if (draft.qty_received === '' || !Number.isFinite(qty) || qty <= 0) return 'Qty Received must be a number greater than zero.'
  const max = receiptEditMax(receipt, dc)
  if (qty > max) return `Qty Received (${qty}) is more than the balance on ${receipt.dc_no} (max ${max}).`
  if (!draft.receipt_date) return 'Receipt Date is required.'
  return null
}

/** ONLY qty_received + receipt_date (033 grants UPDATE on just these). */
export function receiptEditPatch(draft) {
  return { qty_received: Number(draft.qty_received), receipt_date: draft.receipt_date || null }
}

/** Readable text for a DB error on an edit. 033's guards raise clear
 * messages (42501 permission / locked, 23514 limits) -- shown as is; a bare
 * "permission denied for table ..." (missing grant / RLS) is translated. */
export function jobworkDbErrorMessage(error) {
  const message = typeof error === 'string' ? error : error?.message ?? ''
  if (error?.code === '42501' && /^permission denied/i.test(message)) {
    return 'You do not have permission to change this record (supervisor or admin only).'
  }
  if (error?.code === '42501' || error?.code === '23514') return message
  return message || 'Could not save the change.'
}
