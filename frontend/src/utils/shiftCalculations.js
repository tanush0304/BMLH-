// Pure calculation logic for Shift Master's Shift Duration / Net Working
// Hours, kept outside the component so it's independently testable.
// Stored text format must stay exactly as it already is in the DB
// ("8 hours", "7.5 hours", "30 min") -- confirmed by search that
// ShiftMaster.jsx is the only code anywhere that reads shift_duration,
// net_working_hours or lunch_break_duration, but keeping the format means
// existing rows and any future reader stay compatible regardless.

/** "6:00 AM" / "06:00" -> minutes since midnight, or null if unparseable. */
export function parseTimeToMinutes(value) {
  if (!value) return null
  const trimmed = value.trim()

  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed)
  if (ampm) {
    let hour = Number(ampm[1]) % 12
    if (ampm[3].toUpperCase() === 'PM') hour += 12
    return hour * 60 + Number(ampm[2])
  }

  const h24 = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (h24) {
    return Number(h24[1]) * 60 + Number(h24[2])
  }

  return null
}

/** Display a stored shift time in 12-hour form with AM/PM: "8:30" -> "8:30 AM",
 * "20:30" -> "8:30 PM", "8:30 pm" -> "8:30 PM". A bare time is read as
 * 24-hour (same rule as parseTimeToMinutes). Unparseable -> returned as is. */
export function formatTime12(value) {
  const min = parseTimeToMinutes(value ?? '')
  if (min == null) return value ?? ''
  const h24 = Math.floor(min / 60) % 24
  const mm = String(min % 60).padStart(2, '0')
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** "8:30 AM – 8:30 PM" for a shift's start / end ('' when either is missing). */
export function shiftTimeRange(start, end) {
  if (!start || !end) return ''
  return `${formatTime12(start)} – ${formatTime12(end)}`
}

/** "30 min" / "30" / "30 mins" / "0.5 hour" -> minutes. Blank/null -> 0.
 * Returns null if non-blank and unparseable. */
export function parseLunchMinutes(value) {
  if (value == null || value.trim() === '') return 0
  const s = value.trim().toLowerCase()

  const hourMatch = /^(\d+(?:\.\d+)?)\s*hours?$/.exec(s)
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60)

  const minMatch = /^(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)?$/.exec(s)
  if (minMatch) return Math.round(Number(minMatch[1]))

  return null
}

/** Round to 2 decimals, drop trailing zeros, "1 hour" singular, else "hours". */
export function formatHours(hoursDecimal) {
  const rounded = Math.round(hoursDecimal * 100) / 100
  if (rounded === 1) return '1 hour'
  const trimmed = rounded.toFixed(2).replace(/\.?0+$/, '')
  return `${trimmed} hours`
}

/**
 * Computes Shift Duration / Net Working Hours from start_time, end_time
 * (both "h:mm AM/PM" from TimeInput12) and lunch_break_duration (free text).
 *
 * Returns:
 *   shift_duration, net_working_hours -- the text to store/display, or ''
 *   message  -- informational, non-blocking (e.g. identical start/end)
 *   warning  -- non-blocking, shown but doesn't prevent save (e.g. >12h)
 *   error    -- blocking, must prevent save (e.g. lunch longer than shift)
 */
export function computeShiftHours({ start_time, end_time, lunch_break_duration }) {
  const result = { shift_duration: '', net_working_hours: '', message: null, warning: null, error: null }

  const startMin = parseTimeToMinutes(start_time)
  const endMin = parseTimeToMinutes(end_time)
  if (startMin == null || endMin == null) return result

  if (startMin === endMin) {
    result.message = 'Start and end time are the same'
    return result
  }

  // Past midnight: end earlier than start means the shift wraps the clock.
  let durationMin = endMin - startMin
  if (durationMin < 0) durationMin += 24 * 60

  result.shift_duration = formatHours(durationMin / 60)
  if (durationMin / 60 > 12) {
    result.warning = 'Shift is over 12 hours - check AM/PM'
  }

  const lunchMin = parseLunchMinutes(lunch_break_duration)
  if (lunchMin == null) {
    result.error = 'Could not understand Lunch Break Duration value.'
    return result
  }
  if (lunchMin > durationMin) {
    result.error = 'Lunch break cannot be longer than the shift duration.'
    return result
  }

  result.net_working_hours = formatHours((durationMin - lunchMin) / 60)
  return result
}

/** Blocking check for a shift's times: start and end required, different,
 * and net time (after lunch) above zero. Overnight shifts are fine.
 * Returns a message or null. */
export function shiftTimesError({ start_time, end_time, lunch_break_duration }) {
  const start = parseTimeToMinutes(start_time ?? '')
  const end = parseTimeToMinutes(end_time ?? '')
  if (start == null || end == null) return 'Start Time and End Time are required.'
  if (start === end) return 'Start Time and End Time must be different.'
  const lunch = parseLunchMinutes(lunch_break_duration ?? '')
  if (lunch == null) return 'Lunch Break must be minutes (e.g. 30) or hours (e.g. 0.5 hour).'
  const net = (end - start + 1440) % 1440 - lunch
  if (net <= 0) return 'Net Working Hours must be more than 0 -- check the times and lunch break.'
  return null
}
