// "Date: 2026-10-20 · Shift A (8:30 AM – 8:30 PM)" -- the read-only line at the
// top of Production Data Entry / Manual Operations (the grid's date + shift,
// also while correcting a rejected shift on another date) and WIP Receipt /
// Issue (the transaction date that will be saved). Field audit.
import { shiftTimeRange } from './shiftCalculations'

export function shiftDateLine({ date, shiftCode, shifts = [] }) {
  if (!date) return ''
  const s = shiftCode ? shifts.find((x) => x.shift_code === shiftCode) : null
  if (!shiftCode) return `Date: ${date}`
  const name = s?.shift_name || shiftCode
  const range = shiftTimeRange(s?.start_time, s?.end_time)
  const times = range ? ` (${range})` : ''
  return `Date: ${date} · ${name}${times}`
}
