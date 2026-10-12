// Period presets for the Reports filter bar. Dates are local "YYYY-MM-DD"
// business dates (formatLocalISODate), never UTC.
import { formatLocalISODate } from './dates'

export const PERIOD_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
]

export const DEFAULT_PERIOD = 'last30'

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso, days) {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return formatLocalISODate(d)
}

/** { from, to } for a preset, relative to `today` (a Date). 'custom' -> null
 * (the screen keeps whatever dates the user typed). */
export function periodRange(preset, today = new Date()) {
  const t = formatLocalISODate(today)
  switch (preset) {
    case 'today':
      return { from: t, to: t }
    case 'yesterday': {
      const y = addDays(t, -1)
      return { from: y, to: y }
    }
    case 'last7':
      return { from: addDays(t, -6), to: t }
    case 'last30':
      return { from: addDays(t, -29), to: t }
    case 'thisMonth':
      return { from: formatLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1)), to: t }
    case 'lastMonth':
      return {
        from: formatLocalISODate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: formatLocalISODate(new Date(today.getFullYear(), today.getMonth(), 0)),
      }
    default:
      return null
  }
}

/** Every date from..to inclusive (empty when from > to). */
export function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** The window of equal length immediately before from..to (for "vs previous period"). */
export function previousRange({ from, to }) {
  const length = daysBetween(from, to).length
  return { from: addDays(from, -length), to: addDays(from, -1) }
}

/** "2026-09-23" -> "23-09-2026" (table / export display). */
export function displayDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-23" -> "23-Sep" (chart axis). */
export function shortDate(iso) {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}-${MONTHS[Number(m) - 1]}`
}
