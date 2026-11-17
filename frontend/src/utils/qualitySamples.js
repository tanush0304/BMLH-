// 057: several samples per parameter in one inspection (BMLH In-Process
// Inspection Report, up to 10 observation columns). One "quality log readings"
// row per parameter per sample (sample_no 1..N). A parameter is Not Accepted /
// Rejected when ANY sample is out of tolerance or Not OK; the inspection is
// Rejected when any parameter is (029 view: any Not Accepted reading).
import { computeQualityResult, gaugeResultLabel, isGaugeRow, readingResultText, readingValueText } from './qualityResult'

export const MAX_SAMPLES = 10 // = 057 check (sample_no between 1 and 10)

/** Samples input -> whole number 1..MAX_SAMPLES, or null when invalid. */
export function parseSamples(value) {
  const s = String(value ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= MAX_SAMPLES ? n : null
}

export const samplesMessage = () => `Samples must be a whole number from 1 to ${MAX_SAMPLES}.`

/** Keep the first n values, pad with '' (lowering Samples drops the extra columns). */
export function resizeValues(values = [], n) {
  return Array.from({ length: n }, (_, i) => values[i] ?? '')
}

/** One sample's result: Measured -> Accepted / Not Accepted (null when blank
 * or no Standard); Gauge / Job Work -> Accepted / Rejected (null when unanswered). */
export function sampleResult(row, value) {
  if (isGaugeRow(row)) return gaugeResultLabel(value)
  return computeQualityResult(row.standard, row.upper_tolerance, row.lower_tolerance, value)
}

const isBad = (result) => result === 'Not Accepted' || result === 'Rejected'

/**
 * Parameter result over its samples: any bad sample -> that bad label (Gauge
 * 'Rejected', Measured 'Not Accepted'); every sample answered and good ->
 * 'Accepted'; otherwise null (still being filled / no limit set).
 */
export function parameterResult(row, values = []) {
  const results = values.map((v) => sampleResult(row, v))
  const bad = results.find(isBad)
  if (bad) return bad
  if (results.length > 0 && results.every((r) => r === 'Accepted')) return 'Accepted'
  return null
}

const filled = (row, v) => (isGaugeRow(row) ? v === 'OK' || v === 'Not OK' : v !== '' && v !== null && v !== undefined)

/**
 * Save check. With samples (057): every sample of every parameter is
 * required. Before 057 (one sample): Gauge rows required, Measured rows may
 * be left blank but at least one value is needed (unchanged behaviour).
 */
export function readingsProblem(rows, { samplesOn }) {
  for (const r of rows) {
    if (!isGaugeRow(r)) continue
    const i = r.values.findIndex((v) => !filled(r, v))
    if (i >= 0) return r.values.length > 1 ? `Choose OK or Not OK for ${r.quality_parameter}, sample ${i + 1}.` : `Choose OK or Not OK for ${r.quality_parameter}.`
  }
  if (samplesOn) {
    for (const r of rows) {
      const i = r.values.findIndex((v) => !filled(r, v))
      if (i >= 0) return r.values.length > 1 ? `Enter ${r.quality_parameter}, sample ${i + 1}.` : `Enter a value for ${r.quality_parameter}.`
      const nan = r.values.findIndex((v) => !isGaugeRow(r) && !Number.isFinite(Number(v)))
      if (nan >= 0) return `Enter a number for ${r.quality_parameter}${r.values.length > 1 ? `, sample ${nan + 1}` : ''}.`
    }
    return null
  }
  if (!rows.some((r) => r.values.some((v) => filled(r, v)))) return 'Enter at least one Observed Value before saving.'
  return null
}

/** Reading rows to insert. sample_no only once 057 is run; before it the
 * single value per parameter, blank Measured rows skipped (as before). */
export function readingsPayload(rows, logId, { samplesOn }) {
  const out = []
  for (const r of rows) {
    r.values.forEach((v, i) => {
      if (!filled(r, v)) return
      out.push({
        quality_log_id: logId,
        quality_parameter_id: r.quality_parameter_id,
        ...(isGaugeRow(r) ? { observed_value: null, gauge_result: v } : { observed_value: Number(v) }),
        ...(samplesOn ? { sample_no: i + 1 } : {}),
      })
    })
  }
  return out
}

const fmt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 4 })

/**
 * History: saved readings (one per sample) -> one row per inspection x
 * parameter: samples in order, value text ("10.02, 10.03 (n=2)" / "9 OK /
 * 1 Not OK"), min / max (Measured), count, parameter result (any bad sample
 * -> Not Accepted / Rejected). `readings` keeps the source rows (edit panel).
 */
export function groupReadingsByParameter(rows = []) {
  const groups = new Map()
  for (const r of rows) {
    const key = `${r.quality_log_id}|${r.quality_parameter_id ?? r.quality_parameter}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  return [...groups.values()].map((list) => {
    const readings = [...list].sort((a, b) => (a.sample_no ?? 1) - (b.sample_no ?? 1))
    const first = readings[0]
    const gauge = isGaugeRow(first)
    const results = readings.map(readingResultText)
    const bad = results.find(isBad)
    const result = bad ?? (results.length && results.every((x) => x === 'Accepted') ? 'Accepted' : results.find((x) => x) ?? null)
    let value_text
    let min = null
    let max = null
    if (gauge) {
      const ok = readings.filter((r) => r.gauge_result === 'OK').length
      const notOk = readings.filter((r) => r.gauge_result === 'Not OK').length
      value_text = readings.length > 1 ? `${ok} OK / ${notOk} Not OK` : readingValueText(first)
    } else {
      const nums = readings.map((r) => Number(r.observed_value)).filter(Number.isFinite)
      if (nums.length) {
        min = Math.min(...nums)
        max = Math.max(...nums)
      }
      value_text = readings.length > 1 ? `${nums.map(fmt).join(', ')} (n=${readings.length})` : readingValueText(first)
    }
    const edited = readings.filter((r) => r.edited_at).sort((a, b) => String(b.edited_at).localeCompare(String(a.edited_at)))[0]
    return {
      ...first,
      key: `${first.quality_log_id}-${first.quality_parameter_id ?? first.quality_parameter}`,
      readings,
      sample_count: readings.length,
      value_text,
      min_text: min === null || readings.length < 2 ? '' : fmt(min),
      max_text: max === null || readings.length < 2 ? '' : fmt(max),
      result_text: result,
      edited_by: edited?.edited_by ?? first.edited_by ?? null,
      edited_at: edited?.edited_at ?? first.edited_at ?? null,
    }
  })
}

/** JS mirror of 029 "report quality inspections".inspection_result over an
 * inspection's readings (every sample is a reading): none -> 'No readings';
 * any 'Not Accepted' -> 'Rejected'; else 'Accepted'. */
export function inspectionResultFromReadings(readings = []) {
  if (readings.length === 0) return 'No readings'
  return readings.some((r) => r.result === 'Not Accepted') ? 'Rejected' : 'Accepted'
}
