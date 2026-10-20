// Void entry (migration 034): RM Receipt (GRN), Jobwork Dispatch (DC) and
// FG Dispatch (FGD). The row stays, marked voided_at / voided_by /
// void_reason, and counts nowhere. Supervisor/admin only, reason required,
// cannot be undone. The database (void_entry RPC) enforces the same rules;
// these give the screens an early, clear message.
import { userDisplayName } from './stockEdit'

export const VOID_TYPES = { GRN: 'GRN', DC: 'DC', FGD: 'FGD' }

export const isVoided = (row) => !!row?.voided_at

/** Rows that still count (stock, availability, report totals). */
export const excludeVoided = (rows = []) => rows.filter((r) => !isVoided(r))

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function docNoOf(type, row) {
  return type === VOID_TYPES.DC ? row?.dc_no : row?.doc_no
}

/**
 * Why this row can't be voided, or null. `ctx`:
 *   GRN: { closingStock } -- the material's closing stock now (voided rows
 *        already left out by the balance view).
 *   DC:  row from "job order status" (is_open, closed_short_at, qty_received,
 *        receipt_count) or the table row.
 */
export function voidBlockReason(type, row, ctx = {}) {
  if (!row) return 'Pick a row in the list first.'
  const doc = docNoOf(type, row)
  if (isVoided(row)) return `${doc} is already void.`
  if (type === VOID_TYPES.DC) {
    const received = num(row.qty_received) > 0 || num(row.receipt_count) > 0
    if (!row.is_open || row.closed_short_at || received) {
      return `${doc} ${received ? 'has receipts' : 'is closed'} -- use Close Short instead.`
    }
    return null
  }
  if (type === VOID_TYPES.GRN) {
    const closing = num(ctx.closingStock)
    if (closing - num(row.qty) < 0) {
      return `${doc} cannot be voided: ${num(row.qty) - closing} of it has already been issued (closing stock ${closing}).`
    }
    return null
  }
  return null
}

export function voidReasonError(reason) {
  return reason?.trim() ? null : 'Enter a reason to void this entry.'
}

/** Arguments for rpc('void_entry'). */
export function voidRpcArgs(type, docNo, reason) {
  return { p_doc_type: type, p_doc_no: docNo, p_reason: reason.trim() }
}

/** "VOID by <name> on <date/time>: <reason>" (hover + export text); '' when not void. */
export function voidedLabel(row, appUsers = []) {
  if (!isVoided(row)) return ''
  const who = userDisplayName(row.voided_by, appUsers)
  const when = new Date(row.voided_at).toLocaleString()
  return `VOID by ${who} on ${when}: ${row.void_reason ?? ''}`
}

/** Adds `void_label` (text, also exported) to each row. */
export function withVoidLabels(rows, appUsers) {
  return rows.map((r) => ({ ...r, void_label: voidedLabel(r, appUsers) }))
}

/** Sum of a column over rows that still count. */
export function sumExcludingVoided(rows, key) {
  return excludeVoided(rows).reduce((a, r) => a + num(r[key]), 0)
}

/** Strike-through for a voided list row (RecordsList rowClassName). */
export const voidRowClass = (row) => (isVoided(row) ? 'line-through text-slate-400' : '')
