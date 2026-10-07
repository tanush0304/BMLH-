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
