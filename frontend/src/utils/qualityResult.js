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

// ---------------------------------------------------------------- 048 Gauge
// A Gauge parameter (check_type 'Gauge') is recorded as OK / Not OK instead of
// a value. The view keeps 'Accepted' / 'Not Accepted' (report quality
// inspections unchanged); screens show a gauge result as Accepted / Rejected.

export const isGaugeRow = (row) => row?.check_type === 'Gauge'

/** 'OK' -> 'Accepted', 'Not OK' -> 'Rejected', else null. */
export function gaugeResultLabel(gaugeResult) {
  if (gaugeResult === 'OK') return 'Accepted'
  if (gaugeResult === 'Not OK') return 'Rejected'
  return null
}

/** What to show in an "Observed Value" cell / export: OK / Not OK for a gauge row. */
export function readingValueText(row) {
  if (isGaugeRow(row)) return row?.gauge_result ?? ''
  return row?.observed_value ?? ''
}

/** Result to show for a saved reading (gauge -> Accepted / Rejected). */
export function readingResultText(row) {
  if (isGaugeRow(row)) return gaugeResultLabel(row?.gauge_result)
  return row?.result ?? null
}
