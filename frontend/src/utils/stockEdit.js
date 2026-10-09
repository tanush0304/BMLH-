import { toNumberOrNull } from './numericFields'
import { validateRmIssueQuantity } from './rmStock'
import { validateDispatchQuantity } from './finishedGoodsValidation'
import { validateWipIssueQuantity } from './wipValidation'

// Editing an existing Stores transaction (supervisor/admin only). The
// balances the screens hold already include the row being edited, so each
// check first takes that row back out ("excluding the row being edited"),
// then applies the same rule a new entry would.

export const canEditStock = (role) => role === 'supervisor' || role === 'admin'

/** Only these fields are ever sent on an edit; everything else is read-only. */
export function stockEditPatch(draft, { withSupplier = false, withRemarks = true, qtyKey = 'qty', dateKey = 'transaction_date' } = {}) {
  const patch = {
    [qtyKey]: toNumberOrNull(draft.qty),
    [dateKey]: draft.transaction_date || null,
  }
  if (withRemarks) patch.remarks = draft.remarks?.trim() ? draft.remarks.trim() : null
  if (withSupplier) patch.supplier_id = draft.supplier_id || null
  return patch
}

function positive(value) {
  const n = toNumberOrNull(value)
  return n !== null && n > 0 ? n : null
}

/** RM Issue: new qty <= closing stock without this row's old qty. */
export function validateRmIssueEdit(newQty, oldQty, closingStock) {
  return validateRmIssueQuantity(newQty, Number(closingStock ?? 0) + Number(oldQty ?? 0))
}

/** FG Dispatch: same rule as a new dispatch, with this row's old qty added
 * back to both the PRD's stock and the order's remaining balance. */
export function validateFgDispatchEdit(newQty, oldQty, prdStock, orderBalance) {
  const old = Number(oldQty ?? 0)
  return validateDispatchQuantity(String(newQty), Number(prdStock ?? 0) + old, Number(orderBalance ?? 0) + old).error
}

/** WIP Issue: new qty <= the source pool's balance without this row. */
export function validateWipIssueEdit(newQty, oldQty, poolBalance) {
  return validateWipIssueQuantity(String(newQty), Number(poolBalance ?? 0) + Number(oldQty ?? 0)).error
}

/** Any receipt (RM, FG, WIP): qty > 0, and lowering it must not take the
 * balance it fed (material closing stock / FG PRD stock / WIP stage pool)
 * below zero: balance - old + new >= 0. */
export function validateReceiptEdit(newQty, oldQty, currentBalance) {
  const qty = positive(newQty)
  if (qty === null) return 'Quantity must be a number greater than zero.'
  const after = Number(currentBalance ?? 0) - Number(oldQty ?? 0) + qty
  if (after < 0) {
    return `This change would make the stock negative (${after}). Items from this receipt have already been issued.`
  }
  return null
}

/** "Edited by <name> on <date/time>" for the list badge; '' if never edited. */
export function editedLabel(row, appUsers = []) {
  if (!row?.edited_at) return ''
  const user = appUsers.find((u) => u.user_id === row.edited_by)
  const who = user?.full_name || user?.name || user?.email || (row.edited_by ? String(row.edited_by).slice(0, 8) : 'unknown')
  const when = new Date(row.edited_at).toLocaleString()
  const prev = row.previous_qty !== null && row.previous_qty !== undefined ? ` (qty was ${row.previous_qty})` : ''
  return `Edited by ${who} on ${when}${prev}`
}
