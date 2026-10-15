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
