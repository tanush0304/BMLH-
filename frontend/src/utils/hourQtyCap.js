// PRD-009 test (2026-11-12/13): produced-qty caps checked before an hour save.
// Same rules as migration 051's trg_production_log_hours_qty_cap:
//
//  * per hour row (A): produced <= standard for that hour
//      standard = floor(max(0, slot minutes - 8 idle - setup) / cycle time
//                       * (1 + tolerance % / 100))
//      cycle time = the log's cycle_time_min, else 60 / standard qty per hour;
//      no cycle time -> no cap. Slot minutes = slotMinutes(shift, hour_slot)
//      (SQL hour_slot_minutes).
//      Mode ("app settings" hour_qty_cap_mode; missing / invalid -> strict):
//        strict              -> blocks everyone
//        supervisor_override -> blocks operators; supervisor / admin get a
//                               warning they can save past
//        off                 -> no hourly cap
//      Tolerance (hour_qty_cap_tolerance_pct): number 0-100, else 0.
//  * open log (B): sum produced of all its hours <= the log's planned qty
//    (the material reserved at Start) -- always blocks, any mode / role.
//    Not for closed-log corrections (046 handles those).
import { totalIdle } from './productionReport'
import { slotMinutes } from './shiftHoursLimit'

export const HOUR_CAP_MODES = [
  { value: 'strict', label: 'Strict -- block everyone' },
  { value: 'supervisor_override', label: 'Supervisor override -- block operators, warn supervisors / admins' },
  { value: 'off', label: 'Off -- no hourly cap' },
]

const QTY_KEYS = ['qty_produced', 'opr_issue', 'program_issue', 'tool_issue', 'power_issue', 'inspection', 'breakdown', 'mc_clean', 'lunch', 'setup_min']

const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0)

/** Raw settings -> { mode, tolerancePct }; missing / invalid -> strict, 0 (as 051). */
export function normalizeHourCapSettings({ mode, tolerancePct } = {}) {
  const okMode = HOUR_CAP_MODES.some((m) => m.value === mode) ? mode : 'strict'
  const text = tolerancePct === null || tolerancePct === undefined ? '' : String(tolerancePct)
  const pct = /^[0-9]+(\.[0-9]+)?$/.test(text) && Number(text) <= 100 ? Number(text) : 0
  return { mode: okMode, tolerancePct: pct }
}

/** Cycle time in minutes, or null (no cap). */
export function capCycleTime({ cycleTimeMin, standardQtyPerHour }) {
  const ct = Number(cycleTimeMin)
  if (ct > 0) return ct
  const std = Number(standardQtyPerHour)
  return std > 0 ? 60 / std : null
}

const fmt2 = (n) => String(Math.round(n * 100) / 100)

/** { std, netMin } for one hour row, or null without a cycle time. */
export function hourStandardQty(row, { shift, cycleTime, tolerancePct = 0 }) {
  if (!cycleTime) return null
  const netMin = Math.max(0, slotMinutes(shift, row.hour_slot) - (totalIdle(row) || 0))
  return { std: Math.floor((netMin / cycleTime) * (1 + tolerancePct / 100) + 1e-9), netMin }
}

export function hourCapMessage(row, { std, netMin }, cycleTime, tolerancePct = 0) {
  const tol = tolerancePct > 0 ? ` + ${fmt2(tolerancePct)} %` : ''
  return `Hour ${row.hour_slot}: produced ${num(row.qty_produced)} is more than the standard ${std} for this hour (${netMin} min net ÷ ${fmt2(cycleTime)} min cycle time${tol}).`
}

const isSupervisor = (role) => role === 'supervisor' || role === 'admin'

/**
 * Checks a save of `newRows` (new hour rows) and `changes` ([{ id, ...changed
 * fields }] of saved rows in `logHours`). `shiftFor(code)` -> shift master
 * row; new rows use `draftShiftCode`. `plannedQty` null -> no planned cap
 * (closed-log correction). `settings` = raw { mode, tolerancePct }; `role`
 * decides supervisor_override.
 * Returns { blocks: [...], warnings: [...] } -- blocks stop the save;
 * warnings (supervisor / admin under supervisor_override) need a confirm.
 */
export function hourQtyCapProblems({
  newRows = [],
  changes = [],
  logHours = [],
  shiftFor,
  draftShiftCode,
  cycleTimeMin,
  standardQtyPerHour,
  plannedQty = null,
  settings,
  role,
}) {
  const { mode, tolerancePct } = normalizeHourCapSettings(settings)
  const cycleTime = mode === 'off' ? null : capCycleTime({ cycleTimeMin, standardQtyPerHour })
  const hourList = mode === 'supervisor_override' && isSupervisor(role) ? 'warnings' : 'blocks'
  const out = { blocks: [], warnings: [] }
  const byId = new Map(logHours.map((h) => [h.id, h]))
  const check = (row, code) => {
    const s = hourStandardQty(row, { shift: shiftFor?.(code), cycleTime, tolerancePct })
    if (s && num(row.qty_produced) > s.std) out[hourList].push(hourCapMessage(row, s, cycleTime, tolerancePct))
  }
  for (const r of newRows) check(r, r.shift_code ?? draftShiftCode)
  const merged = new Map()
  for (const c of changes) {
    const saved = byId.get(c.id)
    if (!saved) continue
    const row = { ...saved, ...c }
    merged.set(c.id, row)
    if (QTY_KEYS.some((k) => k in c)) check(row, row.shift_code ?? draftShiftCode)
  }
  if (plannedQty !== null && plannedQty !== undefined && plannedQty !== '') {
    const before = logHours.reduce((s, h) => s + num(h.qty_produced), 0)
    const total = logHours.reduce((s, h) => s + num((merged.get(h.id) ?? h).qty_produced), 0) + newRows.reduce((s, r) => s + num(r.qty_produced), 0)
    if (total > num(plannedQty) && total > before) {
      out.blocks.push(`Produced ${total} is more than this log's planned qty ${num(plannedQty)} (the material available at Start).`)
    }
  }
  return out
}
