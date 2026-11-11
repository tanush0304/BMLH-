// Pure logic for Production Data Entry's "Hourly Production Report" additions
// (migration 017): idle-minute categories per hour row, per-row validation,
// and the live footer totals (computed here, never stored).
import { parseTimeToMinutes } from './shiftCalculations'
import { slotMinutes } from './shiftHoursLimit'

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

// 046: per-hour setup minutes ("production log hours".setup_min). Shown /
// sent only once 046 is run (idleCategories(true)); old rows carry null.
// Counted in the idle total (<= 60 per hour) and deducted for the target.
export const SETUP_CATEGORY = { key: 'setup_min', label: 'Setup' }

/** Idle columns for the grid: Setup first when 046 is run, then the 8. */
export function idleCategories(withSetup = false) {
  return withSetup ? [SETUP_CATEGORY, ...IDLE_CATEGORIES] : IDLE_CATEGORIES
}


function num(v) {
  if (v === '' || v === undefined || v === null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** Idle minutes of one hour row: the 8 categories + setup (null / missing = 0). */
export function totalIdle(row) {
  return IDLE_CATEGORIES.reduce((sum, c) => sum + num(row?.[c.key]), 0) + num(row?.setup_min)
}

/**
 * Returns an error string for one hour row's idle minutes, or null when
 * valid. Each category must be a whole number >= 0; the row total must be
 * <= 60 and also <= the slot's own length (a shift's last slot can be
 * shorter than an hour, e.g. 5:00-5:30 PM).
 */
export function validateIdle(row, slotMinutes = MAX_IDLE_PER_HOUR) {
  for (const c of [SETUP_CATEGORY, ...IDLE_CATEGORIES]) {
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
 *   settingMin      Σ row setup (046) when any row has setup, else the
 *                   header's setting time (no double count -- same rule as
 *                   046's "report production setup")
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
    settingMin: rows.some((r) => r.setup_min != null && r.setup_min !== '')
      ? rows.reduce((sum, r) => sum + (num(r.setup_min) || 0), 0)
      : num(settingTimeMin) || 0,
  }
}

/** Cycle Time Master row for the part + process (seq): exact machine match
 * first, otherwise any row for that part + seq. */
export function pickCycleTime(cycleRows, { partSerialNumber, seq, machineId }) {
  const forProcess = cycleRows.filter((r) => r.part_serial_number === partSerialNumber && r.seq === seq)
  const row = forProcess.find((r) => r.machine_id === machineId) ?? forProcess[0]
  return row?.cycle_time_min ?? null
}

function round1(n) {
  return Math.round(n * 10) / 10
}

/** Live log footer totals over every saved hour of the log plus the hour
 * rows typed but not yet saved. Mirrors the "production log totals" view.
 *
 * Before 046 (`goodVsTarget` absent): efficiency = produced / (std qty per
 * hour x hour rows).
 * After 046 (`goodVsTarget: { shifts, draftShiftCode, cycleTimeMin }`), per row:
 *   good   = produced - rejected - rework
 *   target = max(0, slot minutes - setup - 8 idle) / cycle time (min)
 * efficiency = 100 x sum good / sum target; no cycle time or target 0 -> null
 * (`no_cycle_time` true when the cycle time is missing). Slot minutes =
 * slotMinutes(row's shift, hour_slot) -- same as SQL hour_slot_minutes.
 * Reject / rework % of produced; 1 decimal; null when not computable.
 * Display only -- the view stays the source of truth after save. */
export function computeLiveLogTotals({ savedHours = [], draftRows = [], standardQtyPerHour, goodVsTarget = null }) {
  // A draft row carrying an id is an edit of that saved row -- it replaces it.
  const editedIds = new Set(draftRows.filter((r) => r.id != null).map((r) => r.id))
  const rows = [...savedHours.filter((h) => !editedIds.has(h.id)), ...draftRows]
  let produced = 0
  let rejected = 0
  let rework = 0
  for (const r of rows) {
    produced += num(r.qty_produced) || 0
    rejected += num(r.qty_rejected) || 0
    rework += num(r.qty_rework) || 0
  }
  const std = Number(standardQtyPerHour)
  const out = {
    total_produced: produced,
    total_rejected: rejected,
    total_rework: rework,
    efficiency_pct: std > 0 && rows.length > 0 ? round1((100 * produced) / (std * rows.length)) : null,
    reject_pct: produced > 0 ? round1((100 * rejected) / produced) : null,
    rework_pct: produced > 0 ? round1((100 * rework) / produced) : null,
  }
  if (!goodVsTarget) return out

  const { shifts = [], draftShiftCode = '', cycleTimeMin } = goodVsTarget
  const ct = Number(cycleTimeMin) > 0 ? Number(cycleTimeMin) : std > 0 ? 60 / std : null
  let netMin = 0
  for (const r of rows) {
    const shift = shifts.find((x) => x.shift_code === (r.shift_code ?? draftShiftCode))
    netMin += Math.max(0, slotMinutes(shift, r.hour_slot) - (totalIdle(r) || 0))
  }
  const good = produced - rejected - rework
  const target = ct ? Math.round((netMin / ct) * 100) / 100 : null
  return {
    ...out,
    total_good: good,
    target_qty: target,
    efficiency_pct: ct && netMin > 0 ? round1((100 * good) / (netMin / ct)) : null,
    no_cycle_time: !ct,
  }
}
