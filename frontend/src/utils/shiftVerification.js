// Shift Verification (migration 028): one verification per production log
// per (log_date, shift_code). Pure helpers shared by the Shift Verification
// screen and the hour-entry screens.
import { acceptedFromHour } from './qtyLimits'
import { totalIdle } from './productionReport'
import { stageLabel } from './stageLabel'
import { employeeLabelForId } from './employeeLabel'
import { userDisplayName } from './stockEdit'

export const SHIFT_STATUSES = ['Pending', 'Approved', 'Rejected', 'No entry']

export function verificationKey(logId, logDate, shiftCode) {
  return `${logId}|${logDate}|${shiftCode}`
}

/** verification rows -> Map keyed by verificationKey. */
export function indexVerifications(verifications = []) {
  return new Map(verifications.map((v) => [verificationKey(v.log_id, v.log_date, v.shift_code), v]))
}

/** "2026-10-12 14:05" -- no comma, so it survives the CSV export. */
export function formatStamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Status of one log + shift: the stored row's status, else Pending. */
export function shiftStatus(verification) {
  return verification?.status ?? 'Pending'
}

/** Who decided + when, for display ("Approved by X on ..."). */
export function decisionText(verification, appUsers = []) {
  if (!verification) return ''
  if (verification.status === 'Approved') {
    return `Approved by ${userDisplayName(verification.verified_by, appUsers)} on ${formatStamp(verification.verified_at)}`
  }
  if (verification.status === 'Rejected') {
    return `Rejected: ${verification.reject_reason ?? ''}`
  }
  return ''
}

/** Approve is refused (UI copy of the 028 DB guard) when the row is
 * already approved, has no entries, or any of its hours were last saved by
 * the current user -- admins included. Returns the reason, or null. */
export function approveBlockedReason(row, currentUserId) {
  if (!row?.log_id) return 'No entry to approve.'
  if (row.status === 'Approved') return 'Already approved.'
  // 035 correction: the corrector became the entrant (028), so the DB refuses too.
  if (currentUserId && (row.hourRows ?? []).some((h) => h.edited_at && h.edited_by === currentUserId)) {
    return 'You corrected this shift -- another supervisor or admin must approve it.'
  }
  if (currentUserId && row.enteredBy.includes(currentUserId)) {
    return "You entered this shift's data -- another supervisor must approve it."
  }
  return null
}

function sumBy(rows, fn) {
  return rows.reduce((s, r) => s + fn(r), 0)
}

/**
 * Builds the screen rows for one date + shift.
 * - machineRows: one row per (machine, log) with hours in that shift, plus a
 *   "No entry" row for every machine with none (all of "machines master").
 * - manualRows: one row per Manual Operations log (no machine) with hours.
 */
export function buildShiftRows({
  logDate,
  shiftCode,
  machines = [],
  logs = [],
  hours = [],
  verifications = [],
  stages = [],
  orders = [],
  products = [],
  employees = [],
  appUsers = [],
}) {
  const vIndex = indexVerifications(verifications)
  const stageById = new Map(stages.map((s) => [s.id, s]))
  const hoursByLog = new Map()
  for (const h of hours) {
    if (h.log_date !== logDate || h.shift_code !== shiftCode) continue
    if (!hoursByLog.has(h.log_id)) hoursByLog.set(h.log_id, [])
    hoursByLog.get(h.log_id).push(h)
  }

  const logRows = []
  for (const log of logs) {
    const logHours = (hoursByLog.get(log.id) ?? []).sort((a, b) => a.hour_slot - b.hour_slot)
    if (logHours.length === 0) continue
    const stage = stageById.get(log.stage_id)
    const order = orders.find((o) => o.prd_no === log.prd_no)
    const product = products.find((p) => p.part_serial_number === order?.part_serial_number)
    const operatorIds = [...new Set(logHours.map((h) => h.employee_id).filter(Boolean))]
    const v = vIndex.get(verificationKey(log.id, logDate, shiftCode))
    const status = shiftStatus(v)
    const decidedBy = status === 'Approved' ? v.verified_by : status === 'Rejected' ? v.rejected_by : null
    const decidedAt = status === 'Approved' ? v.verified_at : status === 'Rejected' ? v.rejected_at : null
    logRows.push({
      key: verificationKey(log.id, logDate, shiftCode),
      log_id: log.id,
      // 035: Correct is offered only on a closed log; the reset time of a
      // Pending row bounds the current correction.
      log_is_open: log.is_open !== false,
      verification_updated_at: v?.updated_at ?? null,
      log_date: logDate,
      shift_code: shiftCode,
      machine_id: log.machine_id ?? null,
      // 040: planned machine (DB-set on insert; older logs fall back to the stage's)
      planned_machine_id: log.planned_machine_id ?? stage?.machine_id ?? null,
      substitute_reason: log.substitute_reason ?? null,
      substitute_reason_note: log.substitute_reason_note ?? null,
      prd_no: log.prd_no,
      stage: stage ? stageLabel(stage) : '',
      operation: stage?.operation ?? '',
      part: [order?.part_serial_number, product?.part_name].filter(Boolean).join(' – '),
      operatorIds,
      operator: operatorIds.map((id) => employeeLabelForId(id, employees)).join(' / '),
      hours_entered: logHours.length,
      produced: sumBy(logHours, (h) => Number(h.qty_produced ?? 0)),
      accepted: sumBy(logHours, acceptedFromHour),
      rejected: sumBy(logHours, (h) => Number(h.qty_rejected ?? 0)),
      rework: sumBy(logHours, (h) => Number(h.qty_rework ?? 0)),
      idle_min: sumBy(logHours, (h) => totalIdle(h) || 0),
      status,
      reject_reason: status === 'Rejected' ? v.reject_reason ?? '' : '',
      decided_by: decidedBy ? userDisplayName(decidedBy, appUsers) : '',
      decided_at: formatStamp(decidedAt),
      enteredBy: [...new Set(logHours.map((h) => h.entered_by).filter(Boolean))],
      hourRows: logHours,
    })
  }

  const machineLabel = (m) => `${m.machine_name} (${m.machine_id})`
  const machineRows = []
  for (const m of [...machines].sort((a, b) => String(a.machine_id).localeCompare(String(b.machine_id)))) {
    const rows = logRows.filter((r) => r.machine_id === m.machine_id)
    if (rows.length === 0) {
      machineRows.push({
        key: `none|${m.machine_id}`,
        log_id: null,
        log_date: logDate,
        shift_code: shiftCode,
        machine_id: m.machine_id,
        machine: machineLabel(m),
        prd_no: '',
        stage: '',
        part: '',
        operatorIds: [],
        operator: '',
        hours_entered: null,
        produced: null,
        accepted: null,
        rejected: null,
        rework: null,
        idle_min: null,
        status: 'No entry',
        reject_reason: '',
        decided_by: '',
        decided_at: '',
        enteredBy: [],
        hourRows: [],
      })
    } else {
      for (const r of rows) machineRows.push({ ...r, machine: machineLabel(m) })
    }
  }
  // Logs on a machine id that isn't in Machine Master any more still show.
  const known = new Set(machines.map((m) => m.machine_id))
  for (const r of logRows) {
    if (r.machine_id && !known.has(r.machine_id)) machineRows.push({ ...r, machine: r.machine_id })
  }

  // Machines with entries first (what the in-charge has to act on), then
  // "No entry"; machine id order within each group (stable sort).
  machineRows.sort((a, b) => (a.log_id ? 0 : 1) - (b.log_id ? 0 : 1))

  const manualRows = logRows.filter((r) => !r.machine_id).map((r) => ({ ...r, machine: '' }))
  return { machineRows, manualRows }
}

/** Optional Machine / Employee / Status filters. Employee shows only that
 * employee's rows (so "No entry" rows drop out). */
export function filterShiftRows(rows, { machineId = '', employeeId = '', status = '' } = {}) {
  return rows.filter(
    (r) =>
      (!machineId || r.machine_id === machineId) &&
      (!employeeId || r.operatorIds.includes(employeeId)) &&
      (!status || r.status === status)
  )
}

/** Hour-entry screens: the grid's shift is locked when it is Approved, except
 * for admin (the DB lets admin through too). */
export function isShiftLocked(verification, role) {
  return verification?.status === 'Approved' && role !== 'admin'
}

/** The 028 trigger's effect, applied locally: saving hours in a Rejected
 * shift puts it back to Pending with the reason cleared. */
export function markRejectedPending(rows, logDate, shift) {
  return rows.map((v) =>
    v.log_date === logDate && v.shift_code === shift && v.status === 'Rejected'
      ? { ...v, status: 'Pending', reject_reason: null, rejected_by: null, rejected_at: null }
      : v
  )
}
