// 046: shift-hours limit for Production Data Entry / Manual Operations.
// Pure logic, the JS twin of the SQL helpers in 046_shift_hours_efficiency.sql
// (shift_gross_minutes / hour_slot_minutes / fmt_hrs) -- change both together.
//
//   gross minutes = end - start of the shift (break INSIDE; crossing
//                   midnight wraps); unreadable / equal times -> null = no limit
//   slot minutes  = real length of that hour slot: a full slot 60, the last
//                   slot its remainder, a slot beyond the shift 60 (overtime)
//   limits        (per LOG and per MACHINE + date + shift, all logs):
//                   Σ slot minutes <= gross, AND Σ (slot minutes - Lunch
//                   column) <= net (gross - Shift Master lunch_break_duration).
//                   Supervisor / admin may go over both (overtime).
import { parseTimeToMinutes, parseLunchMinutes } from './shiftCalculations'

/** Gross shift length in minutes, or null when the times can't be read. */
export function shiftGrossMinutes(shift) {
  const s = parseTimeToMinutes(shift?.start_time ?? '')
  const e = parseTimeToMinutes(shift?.end_time ?? '')
  if (s == null || e == null || s === e) return null
  return (((e - s) % 1440) + 1440) % 1440
}

/** Real length of one hour slot (see header). Unknown shift -> 60. */
export function slotMinutes(shift, hourSlot) {
  const gross = shiftGrossMinutes(shift)
  const slot = Number(hourSlot)
  if (gross == null || !Number.isFinite(slot) || (slot - 1) * 60 >= gross) return 60
  return Math.min(60, gross - (slot - 1) * 60)
}

/** Σ slot minutes of hour rows ({ hour_slot }) of one shift. */
export function minutesOfRows(rows, shift) {
  return (rows ?? []).reduce((sum, r) => sum + slotMinutes(shift, r.hour_slot), 0)
}

/** Minutes -> hours text: 660 -> "11", 630 -> "10.5", 0 -> "0" (SQL fmt_hrs). */
export function fmtHrs(minutes) {
  const h = Math.round((Number(minutes) || 0) / 60 * 100) / 100
  return String(h)
}

/** "12-11-2026" from "2026-11-12". */
function ddmmyyyy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso ?? ''
}

/** Net shift minutes = gross - lunch_break_duration ("60 min", "1 hour";
 * blank = 0). Unreadable break -> null (only the gross limit applies). */
export function shiftNetMinutes(shift) {
  const gross = shiftGrossMinutes(shift)
  if (gross == null) return null
  const lunch = parseLunchMinutes(shift?.lunch_break_duration == null ? '' : String(shift.lunch_break_duration))
  if (lunch == null) return null
  return Math.max(0, gross - lunch)
}

const lunchOf = (r) => {
  const n = Number(r?.lunch)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Worked minutes of hour rows = Σ (slot minutes - Lunch column). */
export function workedMinutesOfRows(rows, shift) {
  return (rows ?? []).reduce((sum, r) => sum + Math.max(0, slotMinutes(shift, r.hour_slot) - lunchOf(r)), 0)
}

/**
 * Status of the shift-hours limits for the grid (both per log and per
 * machine + date + shift -- the caller passes the other logs' rows):
 *   gross: Σ slot minutes            <= end - start
 *   net:   Σ (slot minutes - lunch)  <= end - start - lunch_break_duration
 *   shift            { shift_code, start_time, end_time, lunch_break_duration }
 *   ownSavedRows     this log's saved rows of date + shift ({ hour_slot, lunch })
 *   otherRows        OTHER logs' rows on the same machine, date + shift ([] for
 *                    Manual Operations -- per-log limit only)
 *   newRows          rows about to be added; editedRows saved rows as edited
 *                    (replace their saved version, e.g. a changed Lunch)
 *   canOvertime      supervisor / admin: never over (bypasses both)
 * Returns null when the shift has no readable times (no limit), else
 *   { grossMin, netMin, usedMin, workedMin, addWorkedMin, remainingMin, overtimeMin, over, banner, error }
 * (remaining / banner are in NET (worked) hours).
 */
export function shiftHoursStatus({ shift, ownSavedRows = [], otherRows = [], newRows = [], editedRows = [], canOvertime = false, machineLabel = '', logDate = '' }) {
  const grossMin = shiftGrossMinutes(shift)
  if (grossMin == null) return null
  const netMin = shiftNetMinutes(shift) // null -> gross limit only
  const editedIds = new Set(editedRows.map((r) => r.id))
  const saved = [...ownSavedRows.filter((r) => !editedIds.has(r.id)), ...editedRows, ...otherRows]
  const usedMin = minutesOfRows(saved, shift)
  const workedMin = workedMinutesOfRows(saved, shift)
  const addMin = minutesOfRows(newRows, shift)
  const addWorkedMin = workedMinutesOfRows(newRows, shift)
  const cap = netMin ?? grossMin
  const remainingMin = Math.max(0, cap - workedMin)
  const overGross = usedMin + addMin > grossMin
  const overNet = netMin != null && workedMin + addWorkedMin > netMin
  const overtimeMin = Math.max(0, usedMin + addMin - grossMin, netMin != null ? workedMin + addWorkedMin - netMin : 0)
  const over = !canOvertime && (overGross || overNet)
  const code = shift?.shift_code ?? ''
  let banner = `${code}: ${fmtHrs(cap)} ${netMin != null ? 'net ' : ''}hrs, worked ${fmtHrs(workedMin)}, remaining ${fmtHrs(remainingMin)}`
  if (addWorkedMin > 0) banner += ` · these rows add ${fmtHrs(addWorkedMin)}`
  if (canOvertime && overtimeMin > 0) banner += ` · overtime ${fmtHrs(overtimeMin)} hrs`
  const where = machineLabel ? `on ${machineLabel}` : 'on this log'
  const incl = machineLabel ? ' (incl. other logs)' : ''
  let error = null
  if (over && overNet) {
    error = `${code} allows ${fmtHrs(netMin)} net hrs ${where} for ${ddmmyyyy(logDate)} -- ${fmtHrs(workedMin)} worked${incl}, ${fmtHrs(Math.max(0, netMin - workedMin))} remaining; these rows add ${fmtHrs(addWorkedMin)}.`
  } else if (over) {
    error = `${code} is ${fmtHrs(grossMin)} hrs (start to end) ${where} for ${ddmmyyyy(logDate)} -- ${fmtHrs(usedMin)} of hour slots used${incl}, ${fmtHrs(Math.max(0, grossMin - usedMin))} left; these rows add ${fmtHrs(addMin)}.`
  }
  return { grossMin, netMin, usedMin, workedMin, addMin, addWorkedMin, remainingMin, overtimeMin, over, banner, error }
}

/** Can an operator add one more slot (`hourSlot`, no lunch) without passing either limit? */
export function canAddSlot(status, shift, hourSlot) {
  if (!status) return true
  const m = slotMinutes(shift, hourSlot)
  if (status.usedMin + status.addMin + m > status.grossMin) return false
  if (status.netMin != null && status.workedMin + status.addWorkedMin + m > status.netMin) return false
  return true
}

/**
 * 046: copy the log's Start "Setting Time" into the first hour rows' Setup,
 * once -- only when no hour of the log has setup yet (saved or typed) and
 * setting time > 0. Fills rows in hour order, each up to what that hour can
 * still take (60 / slot length minus its other idle). Returns new row objects.
 */
export function withSettingTimeAsSetup(rows, { settingTimeMin, logHasRowSetup, shift, otherIdle }) {
  let left = Math.max(0, Math.round(Number(settingTimeMin) || 0))
  if (!left || logHasRowSetup || rows.some((r) => r.setup_min != null && r.setup_min !== '')) return rows
  const ordered = [...rows].sort((a, b) => a.hour_slot - b.hour_slot)
  const filled = new Map()
  for (const r of ordered) {
    if (!left) break
    const room = Math.max(0, Math.min(60, slotMinutes(shift, r.hour_slot)) - (otherIdle?.(r) ?? 0))
    const take = Math.min(room, left)
    if (take > 0) {
      filled.set(r, take)
      left -= take
    }
  }
  return rows.map((r) => (filled.has(r) ? { ...r, setup_min: filled.get(r) } : r))
}
