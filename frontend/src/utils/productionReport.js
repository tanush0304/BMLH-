// Pure logic for Production Data Entry's "Hourly Production Report" additions
// (migration 017): idle-minute categories per hour row, per-row validation,
// and the live footer totals (computed here, never stored).
import { parseTimeToMinutes } from './shiftCalculations'

/** Column name on "production log hours" + display label, in paper-report order. */
export const IDLE_CATEGORIES = [
  { key: 'opr_issue', label: 'Opr Issue' },
  { key: 'program_issue', label: 'Program Issue' },
  { key: 'tool_issue', label: 'Tool Issue' },
  { key: 'power_issue', label: 'Power Issue' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'breakdown', label: 'Breakdown' },
  { key: 'mc_clean', label: 'M/C Clean' },
  { key: 'lunch', label: 'Lunch' },
]

export const MAX_IDLE_PER_HOUR = 60

function num(v) {
  if (v === '' || v === undefined || v === null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export function totalIdle(row) {
  return IDLE_CATEGORIES.reduce((sum, c) => sum + num(row?.[c.key]), 0)
}

/**
 * Returns an error string for one hour row's idle minutes, or null when
 * valid. Each category must be a whole number >= 0; the row total must be
 * <= 60 and also <= the slot's own length (a shift's last slot can be
 * shorter than an hour, e.g. 5:00-5:30 PM).
 */
export function validateIdle(row, slotMinutes = MAX_IDLE_PER_HOUR) {
  for (const c of IDLE_CATEGORIES) {
    const v = num(row?.[c.key])
    if (!Number.isInteger(v) || v < 0) return `${c.label} must be a whole number of minutes, 0 or more`
  }
  const limit = Math.min(MAX_IDLE_PER_HOUR, slotMinutes)
  const total = totalIdle(row)
  if (total > limit) return `Total idle ${total} min exceeds ${limit} min for this hour`
  return null
}

/** slot number -> real length in minutes, matching generateHourlySlots' grid. */
export function slotDurations({ start_time, end_time }) {
  const startMin = parseTimeToMinutes(start_time)
  const endMin = parseTimeToMinutes(end_time)
  if (startMin == null || endMin == null || startMin === endMin) return {}
  let duration = endMin - startMin
  if (duration < 0) duration += 24 * 60
  const out = {}
  for (let i = 0; i * 60 < duration && i < 12; i++) out[i + 1] = Math.min(60, duration - i * 60)
  return out
}

/** Accepted = produced - rejected - rework (rework/reject are not yet good parts). */
export function acceptedQty(row) {
  return num(row?.qty_produced) - num(row?.qty_rejected) - num(row?.qty_rework)
}

/**
 * Footer totals for the report's rows (saved + entered drafts):
 *   accepted        sum of accepted qty
 *   idleMin         sum of all idle categories
 *   productionMin   sum of slot minutes - idle  (slot without a known
 *                   length, e.g. an overtime "Add Hour", counts as 60)
 *   settingMin      the header's setting time
 */
export function computeReportTotals({ rows, durations = {}, settingTimeMin }) {
  let accepted = 0
  let idleMin = 0
  let slotMin = 0
  for (const r of rows) {
    accepted += acceptedQty(r)
    idleMin += totalIdle(r)
    slotMin += durations[r.hour_slot] ?? 60
  }
  return {
    accepted,
    idleMin,
    productionMin: slotMin - idleMin,
    settingMin: num(settingTimeMin) || 0,
  }
}

/** Cycle Time Master row for the part + process (seq): exact machine match
 * first, otherwise any row for that part + seq. */
export function pickCycleTime(cycleRows, { partSerialNumber, seq, machineId }) {
  const forProcess = cycleRows.filter((r) => r.part_serial_number === partSerialNumber && r.seq === seq)
  const row = forProcess.find((r) => r.machine_id === machineId) ?? forProcess[0]
  return row?.cycle_time_min ?? null
}
