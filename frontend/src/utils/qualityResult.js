/**
 * Accepted / Not Accepted for one reading -- mirrors the "quality log results"
 * view's CASE: no Standard -> no result; a blank Upper/Lower Tolerance counts
 * as 0 on that side (no allowance).
 */
function toNum(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export function computeQualityResult(standard, upperTolerance, lowerTolerance, observedValue) {
  const std = toNum(standard)
  const obs = toNum(observedValue)
  if (std === null || obs === null) return null
  const lower = std - (toNum(lowerTolerance) ?? 0)
  const upper = std + (toNum(upperTolerance) ?? 0)
  return obs >= lower && obs <= upper ? 'Accepted' : 'Not Accepted'
}
