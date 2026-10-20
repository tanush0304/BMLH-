// Correct a Rejected shift on a CLOSED log, in Shift Verification
// (migration 035). Supervisor/admin only. Open logs keep the operator
// Correct flow in Data Entry / Manual Operations. The DB enforces all of
// this (closed-log guard, locked columns, knock-on, planned qty); these
// helpers give the screen the same rules and clear messages.
import { IDLE_CATEGORIES } from './productionReport'
import { userDisplayName } from './stockEdit'
import { formatStamp } from './shiftVerification'

/** The only columns a correction may send (035 editable list). */
export const CORRECTION_FIELDS = [
  'qty_produced',
  'qty_rejected',
  'qty_rework',
  ...IDLE_CATEGORIES.map((c) => c.key),
  'remarks',
]

const QTY_LABELS = { qty_produced: 'Produced', qty_rejected: 'Rejected', qty_rework: 'Rework' }

export const canCorrectRole = (role) => role === 'supervisor' || role === 'admin'

/** Supervisors whose hours make up the CURRENT correction of a Pending
 * shift: edited at/after the verification's last change (028's reset time),
 * same boundary as the 035 guard. Empty when not mid-correction. */
export function currentCorrectors(row) {
  if (row?.status !== 'Pending') return []
  const since = row.verification_updated_at ? new Date(row.verification_updated_at).getTime() : null
  const ids = (row.hourRows ?? [])
    .filter((h) => h.edited_at && (since === null || new Date(h.edited_at).getTime() >= since))
    .map((h) => h.edited_by)
    .filter(Boolean)
  return [...new Set(ids)]
}

/** Why Correct isn't offered for this shift row, or null when it is. */
export function correctBlockedReason(row, role, currentUserId) {
  if (!canCorrectRole(role)) return 'Only a supervisor or admin can correct a closed log.'
  if (!row?.log_id) return 'No entry to correct.'
  if (row.log_is_open) return 'This log is still open -- the operator corrects it in Production Data Entry / Manual Operations.'
  if (row.status === 'Rejected') return null
  const correctors = currentCorrectors(row)
  if (row.status === 'Pending' && correctors.length > 0) {
    return correctors.every((id) => id === currentUserId) ? null : 'Another supervisor is correcting this shift.'
  }
  return `Only a Rejected shift can be corrected -- this shift is ${row.status}.`
}

function normalise(key, value) {
  if (key === 'remarks') return value?.trim() ? value.trim() : null
  if (value === '' || value === null || value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : value
}

/** Only the editable fields that changed, typed (numbers / null remarks). */
export function correctionPatch(original, draft) {
  const patch = {}
  for (const key of CORRECTION_FIELDS) {
    if (!(key in (draft ?? {}))) continue
    const next = normalise(key, draft[key])
    const prev = key === 'remarks' ? (original[key] ?? null) : Number(original[key] ?? 0)
    if (next !== prev) patch[key] = next
  }
  return patch
}

/** [{ id, hour_slot, patch }] in hour order, rows with no change left out. */
export function correctionChanges(hourRows, drafts) {
  return [...hourRows]
    .sort((a, b) => a.hour_slot - b.hour_slot)
    .map((h) => ({ id: h.id, hour_slot: h.hour_slot, patch: correctionPatch(h, drafts[h.id] ?? {}) }))
    .filter((c) => Object.keys(c.patch).length > 0)
}

/** null when every changed row is valid, else the first problem. */
export function correctionError(hourRows, drafts) {
  for (const h of hourRows) {
    const d = { ...h, ...(drafts[h.id] ?? {}) }
    for (const key of CORRECTION_FIELDS.filter((k) => k !== 'remarks')) {
      const n = Number(d[key] === '' ? 0 : d[key])
      if (!Number.isFinite(n) || n < 0) return `Hour ${h.hour_slot}: values must be numbers of 0 or more.`
    }
    const idle = IDLE_CATEGORIES.reduce((s, c) => s + Number(d[c.key] || 0), 0)
    if (idle > 60) return `Hour ${h.hour_slot}: idle minutes add up to ${idle} (max 60).`
    if (Number(d.qty_rejected || 0) + Number(d.qty_rework || 0) > Number(d.qty_produced || 0)) {
      return `Hour ${h.hour_slot}: rejected + rework can't be more than produced.`
    }
  }
  return null
}

/**
 * Saves the rows one request at a time, in hour order. Stops at the first
 * failure: { saved: [hour_slot...], failed: { hour_slot, message } | null }.
 * Rows already saved stay saved (the shift is then Pending; only this
 * supervisor can continue).
 */
export async function saveCorrection(changes, update) {
  const saved = []
  for (const c of changes) {
    try {
      await update(c.id, c.patch)
      saved.push(c.hour_slot)
    } catch (e) {
      return { saved, failed: { hour_slot: c.hour_slot, message: shiftCorrectionErrorMessage(e) } }
    }
  }
  return { saved, failed: null }
}

/** DB messages (035 / 028) shown as written; bare permission errors translated. */
export function shiftCorrectionErrorMessage(error) {
  const message = typeof error === 'string' ? error : error?.message ?? ''
  if (error?.code === '42501' && /^permission denied/i.test(message)) {
    return 'You do not have permission to correct this shift (supervisor or admin only).'
  }
  return message || 'Could not save the correction.'
}

/** "Corrected by X — needs another supervisor/admin to approve" for a
 * Pending shift mid-correction; '' otherwise. */
export function correctedByText(row, appUsers = []) {
  const ids = currentCorrectors(row)
  if (ids.length === 0) return ''
  const names = ids.map((id) => userDisplayName(id, appUsers)).join(', ')
  return `Corrected by ${names} — needs another supervisor/admin to approve`
}

/** Hover text for an edited hour: who / when and old -> new quantities. */
export function editedHourTitle(h, appUsers = []) {
  if (!h?.edited_at) return ''
  const parts = Object.entries(QTY_LABELS)
    .filter(([key]) => h[`previous_${key}`] !== null && h[`previous_${key}`] !== undefined && Number(h[`previous_${key}`]) !== Number(h[key]))
    .map(([key, label]) => `${label} ${Number(h[`previous_${key}`])} → ${Number(h[key] ?? 0)}`)
  const head = `Edited by ${userDisplayName(h.edited_by, appUsers)} on ${formatStamp(h.edited_at)}`
  return parts.length ? `${head}: ${parts.join(', ')}` : head
}
