import { formatLocalISODate } from './dates'

export const BUILT_IN_FREQUENCIES = ['Daily', 'Weekly', 'Fortnightly', 'Monthly']

const DAYS_PATTERN = /(\d+)\s*days?\b/i

/** Interval in days stored inside a custom frequency's text
 * ("Every 45 days", "Quarterly (90 days)"), or null. */
export function parseIntervalDays(frequency) {
  const m = DAYS_PATTERN.exec(String(frequency ?? ''))
  const days = m ? Number(m[1]) : null
  return days > 0 ? days : null
}

export function isBuiltInFrequency(frequency) {
  return BUILT_IN_FREQUENCIES.includes(frequency)
}

/** Custom frequency text with its interval kept in it: unchanged when the
 * text already states that many days, otherwise "<text> (N days)". */
export function withIntervalDays(frequency, days) {
  const text = String(frequency ?? '').trim()
  const n = Number(days)
  if (!text || !(n > 0)) return text
  if (parseIntervalDays(text) === n) return text
  const base = text.replace(/\s*\(\s*\d+\s*days?\s*\)\s*$/i, '').trim()
  return `${base} (${n} days)`
}

/** Next due date (YYYY-MM-DD) from the last maintenance date. Custom
 * frequencies use the interval in days carried in their text. */
export function addFrequency(dateString, frequency) {
  if (!dateString || !frequency) return ''
  const date = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  if (frequency === 'Monthly') {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + 1)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(day, lastDay))
    return formatLocalISODate(date)
  }
  const days = { Daily: 1, Weekly: 7, Fortnightly: 14 }[frequency] ?? parseIntervalDays(frequency)
  if (!days) return ''
  date.setDate(date.getDate() + days)
  return formatLocalISODate(date)
}
