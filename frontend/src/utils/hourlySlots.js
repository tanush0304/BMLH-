// Pure logic for auto-generating Machine Entry / Manual Operations' hourly
// slots from a shift's start/end time. Reuses the same 12-hour time parser
// already written for Shift Master (utils/shiftCalculations.js) rather than
// re-parsing "h:mm AM/PM" a second way.
import { parseTimeToMinutes } from './shiftCalculations'

const MAX_SLOTS = 12 // production log hours only allows hour_slot 1-12

function minutesToParts(rawMinutes) {
  const m = ((rawMinutes % 1440) + 1440) % 1440
  const hour24 = Math.floor(m / 60)
  const minute = m % 60
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return { hour12, minute, period }
}

function clockString({ hour12, minute }) {
  return `${hour12}:${String(minute).padStart(2, '0')}`
}

/** "6:00-7:00 AM" when both ends share a period, else "11:00 PM-12:00 AM". */
function formatSlotLabel(startRawMin, endRawMin) {
  const start = minutesToParts(startRawMin)
  const end = minutesToParts(endRawMin)
  if (start.period === end.period) {
    return `${clockString(start)}-${clockString(end)} ${start.period}`
  }
  return `${clockString(start)} ${start.period}-${clockString(end)} ${end.period}`
}

/**
 * Generates one slot per hour of gross shift duration (end minus start, no
 * lunch deduction -- lunch's location within the shift isn't known). Slot
 * numbers are always 1, 2, 3... in order; `label` is the real-clock-time
 * display text only, never stored.
 *
 * - Shifts crossing midnight wrap correctly (end < start means +24h).
 * - A non-whole-hour duration makes the last slot shorter, ending exactly
 *   at the shift's end time (e.g. 9:00 AM-5:30 PM's last slot is 5:00-5:30 PM).
 * - More than 12 slots gets capped at 12 with `capped: true` -- production
 *   log hours only allows hour_slot 1-12.
 * - Missing/unparseable start or end, or an identical start and end (no
 *   usable duration), returns no slots at all -- the caller falls back to
 *   manual "Add hour" entry; this never throws.
 */
export function generateHourlySlots({ start_time, end_time }) {
  const startMin = parseTimeToMinutes(start_time)
  const endMin = parseTimeToMinutes(end_time)
  if (startMin == null || endMin == null || startMin === endMin) {
    return { slots: [], capped: false }
  }

  let durationMin = endMin - startMin
  if (durationMin < 0) durationMin += 24 * 60

  const fullHours = Math.floor(durationMin / 60)
  const remainder = durationMin % 60
  let numSlots = remainder > 0 ? fullHours + 1 : fullHours

  let capped = false
  if (numSlots > MAX_SLOTS) {
    numSlots = MAX_SLOTS
    capped = true
  }

  const slots = []
  for (let i = 0; i < numSlots; i++) {
    const slotStart = startMin + i * 60
    const slotEnd = Math.min(slotStart + 60, startMin + durationMin)
    slots.push({ slot: i + 1, label: formatSlotLabel(slotStart, slotEnd) })
  }

  return { slots, capped }
}

/**
 * Which shift's start/end time should drive the hourly-slot grid: ALWAYS
 * the dropdown's current selection, even once a log is active/resumed.
 *
 * This used to prefer the log's own shift_code once a log existed, back
 * when "production log hours" had no shift/date/user of its own -- every
 * hour on a log was permanently stamped with whatever shift the log was
 * CREATED under, so resuming under a different dropdown selection would
 * silently relabel already-saved history with the wrong clock times.
 *
 * Migration 010 fixed that at the data layer instead: each hour row now
 * carries its own log_date/shift_code/employee_id, and "saved" is judged
 * per (log_id, log_date, shift_code, hour_slot) -- see HourlySlotsEntry.
 * So the dropdown no longer has anything to mislabel; it now simply
 * decides which shift today's NEW hours get stamped with. The log's
 * original shift_code is just where it started, not a lock.
 */
export function resolveEntryShiftTimes({ dropdownShiftCode, shifts }) {
  const shift = shifts.find((s) => s.shift_code === dropdownShiftCode)
  return {
    shiftCode: dropdownShiftCode ?? '',
    start_time: shift?.start_time ?? null,
    end_time: shift?.end_time ?? null,
  }
}

/**
 * Splits a log's full hour-row history (migration 010: each row carries
 * its own log_date/shift_code/employee_id) into:
 *   - savedToday: rows matching TODAY's date and the currently-selected
 *     shift -- these are what the live grid shows as already-saved slots.
 *   - historyList: everything else, collapsed into one summary row per
 *     distinct (log_date, shift_code) pair (employee(s), hour count, total
 *     qty produced) -- a different day or a different shift than what's
 *     currently selected is history, never counted as "saved" against
 *     today's grid and never blocking today's slots from being reused
 *     (e.g. slots 1-8 on day 2 don't collide with slots 1-8 already
 *     logged on day 1 -- the real uniqueness is log_id + log_date +
 *     shift_code + hour_slot, not log_id + hour_slot alone).
 */
export function splitHourHistory({ logHours, today, shiftCode }) {
  const savedToday = logHours.filter((h) => h.log_date === today && h.shift_code === shiftCode)

  const groups = {}
  for (const h of logHours) {
    if (h.log_date === today && h.shift_code === shiftCode) continue
    const key = `${h.log_date}|${h.shift_code}`
    const g = (groups[key] ??= { log_date: h.log_date, shift_code: h.shift_code, employees: new Set(), hours: 0, qty: 0 })
    g.employees.add(h.employee_id)
    g.hours += 1
    g.qty += Number(h.qty_produced ?? 0)
  }
  const historyList = Object.values(groups)
    .map((g) => ({ ...g, employees: [...g.employees].filter(Boolean) }))
    .sort((a, b) =>
      a.log_date === b.log_date ? a.shift_code.localeCompare(b.shift_code) : a.log_date.localeCompare(b.log_date)
    )

  return { savedToday, historyList }
}
