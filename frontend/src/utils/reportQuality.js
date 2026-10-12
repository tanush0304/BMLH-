// Pure logic for the Quality Status report, over "report quality inspections"
// (029: one row per inspection, inspection_result Accepted / Rejected /
// No readings) and "quality log results" (one row per reading).
import { groupBy, pct } from './reportAggregates'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** KPI counts by inspection. Yield = Accepted / inspections that have
 * readings ("No readings" can't pass or fail, so it is left out of yield). */
export function inspectionCounts(inspections) {
  const count = (s) => inspections.filter((i) => i.inspection_result === s).length
  const total = inspections.length
  const accepted = count('Accepted')
  const rejected = count('Rejected')
  const noReadings = count('No readings')
  return {
    total,
    accepted,
    rejected,
    noReadings,
    acceptedPct: pct(accepted, total),
    rejectedPct: pct(rejected, total),
    noReadingsPct: pct(noReadings, total),
    yield_pct: pct(accepted, accepted + rejected),
  }
}

/** Daily counts + yield, one point per day in `days`. */
export function dailyQuality(inspections, days) {
  const byDate = groupBy(inspections, (i) => i.log_date)
  return days.map((date) => ({ date, ...inspectionCounts(byDate.get(date) ?? []) }))
}

/** Tolerance band of a reading: standard - lower .. standard + upper
 * (same rule as "quality log results"); null without a standard. */
export function toleranceBand(r) {
  if (r.standard == null) return null
  const std = num(r.standard)
  return { min: std - num(r.lower_tolerance), max: std + num(r.upper_tolerance), std }
}

/** Readings for one part + parameter in date order, for the parameter chart:
 * [{ label, observed, min, max, std, result }]. `inspectionById` gives each
 * reading's date / PRD; `partForPrd(prd)` its part. */
export function parameterSeries(readings, inspectionById, partForPrd, part, parameter) {
  return readings
    .filter((r) => r.quality_parameter === parameter)
    .map((r) => ({ r, i: inspectionById.get(r.quality_log_id) }))
    .filter(({ i }) => i && partForPrd(i.prd_no) === part)
    .sort((a, b) => (a.i.log_date < b.i.log_date ? -1 : a.i.log_date > b.i.log_date ? 1 : a.r.reading_id - b.r.reading_id))
    .map(({ r, i }) => ({ date: i.log_date, observed: num(r.observed_value), result: r.result, ...(toleranceBand(r) ?? { min: null, max: null, std: null }) }))
}

/** Production pieces per (prd, stage, date, shift) from "report production
 * hours" rows: Map(key -> { produced, rejected, rework }). */
export function piecesByInspectionKey(hourRows) {
  const m = new Map()
  for (const h of hourRows) {
    const k = inspectionKey(h)
    const t = m.get(k) ?? { produced: 0, rejected: 0, rework: 0 }
    t.produced += num(h.produced)
    t.rejected += num(h.rejected)
    t.rework += num(h.rework)
    m.set(k, t)
  }
  return m
}

export const inspectionKey = (x) => `${x.prd_no}|${x.stage_id}|${x.log_date}|${x.shift_code}`

/** Trend buckets: one per day, or one per month when the period is longer
 * than `maxDays` (daily bars become unreadable). [{ key, label, ...counts }] */
export function qualityTrend(inspections, days, { maxDays = 62, dayLabel = (d) => d, monthLabel = (m) => m } = {}) {
  if (days.length <= maxDays) return dailyQuality(inspections, days).map((d) => ({ key: d.date, label: dayLabel(d.date), ...d }))
  const months = [...new Set(days.map((d) => d.slice(0, 7)))]
  const byMonth = groupBy(inspections, (i) => i.log_date.slice(0, 7))
  return months.map((m) => ({ key: m, label: monthLabel(m), ...inspectionCounts(byMonth.get(m) ?? []) }))
}
