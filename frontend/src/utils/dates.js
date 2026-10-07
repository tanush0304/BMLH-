/**
 * Formats any Date object as "YYYY-MM-DD" using its LOCAL getters -- NOT
 * toISOString(), which is UTC and silently reports the wrong (previous)
 * calendar day for anyone west of UTC at night, including all of India
 * (UTC+5:30) before ~5:30am local time, or ALWAYS when the Date has
 * already been pinned to local midnight (e.g. a computed week-start date)
 * -- local midnight in any positive-offset timezone is always the
 * previous UTC day, so that case is wrong 100% of the time, not just
 * near midnight. Every caller here treats the result as a business date
 * (quoted_date, log_date, a maintenance plan's week-start date, ...),
 * where the viewer's own calendar day is what matters, not UTC's.
 */
export function formatLocalISODate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayISO() {
  return formatLocalISODate(new Date())
}

/** The Monday of the week containing `date` (local calendar week, Mon-Sun). */
export function mondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}
