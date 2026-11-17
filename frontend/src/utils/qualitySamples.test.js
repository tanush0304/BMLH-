// 057: samples per parameter -- pure helpers + Quality Status helpers.
import { describe, it, expect } from 'vitest'
import { MAX_SAMPLES, parseSamples, resizeValues, sampleResult, parameterResult, readingsProblem, readingsPayload, groupReadingsByParameter, inspectionResultFromReadings } from './qualitySamples'
import { parameterSeries, seriesLabel, parameterResultsByLog } from './reportQuality'
import { receiptQcState } from './jobworkQc'

const OD = { quality_parameter_id: 1, quality_parameter: 'OD', standard: 50, upper_tolerance: 0.1, lower_tolerance: 0.1, check_type: 'Measured' }
const TH = { quality_parameter_id: 2, quality_parameter: 'Thread', standard: null, check_type: 'Gauge' }
const JW = { quality_parameter_id: 3, quality_parameter: 'Hardness', check_type: 'Measured', job_work_code: 'HT' } // Job Work = Gauge

describe('Samples count', () => {
  it('whole numbers 1..10 only', () => {
    expect(MAX_SAMPLES).toBe(10)
    expect(parseSamples('1')).toBe(1)
    expect(parseSamples(' 10 ')).toBe(10)
    for (const bad of ['0', '11', '2.5', '-1', 'abc', '', null]) expect(parseSamples(bad)).toBeNull()
  })
  it('resize keeps the first values and pads with blanks', () => {
    expect(resizeValues(['1', '2', '3'], 2)).toEqual(['1', '2'])
    expect(resizeValues(['1'], 3)).toEqual(['1', '', ''])
  })
})

describe('Results', () => {
  it('sample: Measured by tolerance, Gauge / Job Work by OK / Not OK', () => {
    expect(sampleResult(OD, '50.1')).toBe('Accepted')
    expect(sampleResult(OD, '50.11')).toBe('Not Accepted')
    expect(sampleResult(OD, '')).toBeNull()
    expect(sampleResult(TH, 'OK')).toBe('Accepted')
    expect(sampleResult(JW, 'Not OK')).toBe('Rejected')
  })
  it('parameter: any bad sample -> bad; all good -> Accepted; unfinished -> null', () => {
    expect(parameterResult(OD, ['50', '49.95', '50.05'])).toBe('Accepted')
    expect(parameterResult(OD, ['50', '50.3', '50'])).toBe('Not Accepted')
    expect(parameterResult(OD, ['50', '50.3', ''])).toBe('Not Accepted')
    expect(parameterResult(OD, ['50', ''])).toBeNull()
    expect(parameterResult(TH, ['OK', 'Not OK', 'OK'])).toBe('Rejected')
    expect(parameterResult(TH, ['OK', 'OK'])).toBe('Accepted')
  })
})

describe('Save check + payload', () => {
  const rows = (od, th) => [{ ...OD, values: od }, { ...TH, values: th }]
  it('with samples: every sample required (Measured and Gauge)', () => {
    expect(readingsProblem(rows(['50', ''], ['OK', 'OK']), { samplesOn: true })).toBe('Enter OD, sample 2.')
    expect(readingsProblem(rows(['50', '50'], ['OK', '']), { samplesOn: true })).toBe('Choose OK or Not OK for Thread, sample 2.')
    expect(readingsProblem(rows(['50', '50'], ['OK', 'Not OK']), { samplesOn: true })).toBeNull()
  })
  it('before 057: blank Measured allowed, at least one value, Gauge required (as before)', () => {
    expect(readingsProblem(rows([''], ['OK']), { samplesOn: false })).toBeNull()
    expect(readingsProblem(rows(['50'], ['']), { samplesOn: false })).toBe('Choose OK or Not OK for Thread.')
    expect(readingsProblem([{ ...OD, values: [''] }], { samplesOn: false })).toBe('Enter at least one Observed Value before saving.')
  })
  it('payload: one row per sample with sample_no (057); none before it', () => {
    expect(readingsPayload(rows(['50', '50.2'], ['OK', 'Not OK']), 9, { samplesOn: true })).toEqual([
      { quality_log_id: 9, quality_parameter_id: 1, observed_value: 50, sample_no: 1 },
      { quality_log_id: 9, quality_parameter_id: 1, observed_value: 50.2, sample_no: 2 },
      { quality_log_id: 9, quality_parameter_id: 2, observed_value: null, gauge_result: 'OK', sample_no: 1 },
      { quality_log_id: 9, quality_parameter_id: 2, observed_value: null, gauge_result: 'Not OK', sample_no: 2 },
    ])
    expect(readingsPayload(rows([''], ['OK']), 9, { samplesOn: false })).toEqual([
      { quality_log_id: 9, quality_parameter_id: 2, observed_value: null, gauge_result: 'OK' },
    ])
  })
})

describe('History grouping', () => {
  const base = { quality_log_id: 7, quality_parameter_id: 1, quality_parameter: 'OD', check_type: 'Measured' }
  it('Measured: samples in order, n, min / max, any NG -> Not Accepted', () => {
    const [g] = groupReadingsByParameter([
      { ...base, reading_id: 3, sample_no: 3, observed_value: 49.95, result: 'Accepted' },
      { ...base, reading_id: 1, sample_no: 1, observed_value: 50, result: 'Accepted' },
      { ...base, reading_id: 2, sample_no: 2, observed_value: 50.3, result: 'Not Accepted' },
    ])
    expect(g.value_text).toBe('50, 50.3, 49.95 (n=3)')
    expect([g.min_text, g.max_text, g.sample_count, g.result_text]).toEqual(['49.95', '50.3', 3, 'Not Accepted'])
    expect(g.readings.map((r) => r.reading_id)).toEqual([1, 2, 3])
  })
  it('Gauge: "n OK / m Not OK" and Rejected; a single old reading shows as before', () => {
    const t = { quality_log_id: 7, quality_parameter_id: 2, quality_parameter: 'Thread', check_type: 'Gauge' }
    const [g] = groupReadingsByParameter([{ ...t, reading_id: 1, sample_no: 1, gauge_result: 'OK' }, { ...t, reading_id: 2, sample_no: 2, gauge_result: 'Not OK' }])
    expect([g.value_text, g.result_text, g.min_text]).toEqual(['1 OK / 1 Not OK', 'Rejected', ''])
    const [one] = groupReadingsByParameter([{ ...base, reading_id: 5, observed_value: 50, result: 'Accepted' }])
    expect([one.value_text, one.result_text, one.min_text, one.sample_count]).toEqual([50, 'Accepted', '', 1])
  })
})

describe('Quality Status (057)', () => {
  const insp = new Map([[7, { log_date: '2026-11-16', prd_no: 'PRD-1' }]])
  const r = (id, s, v) => ({ reading_id: id, quality_log_id: 7, quality_parameter: 'OD', check_type: 'Measured', sample_no: s, observed_value: v, standard: 50, upper_tolerance: 0.1, lower_tolerance: 0.1 })
  it('Parameter Analysis plots every sample in sample order; label "date · S3"', () => {
    const pts = parameterSeries([r(12, 3, 50.1), r(10, 1, 50), r(11, 2, 50.2)], insp, () => 'P1', 'P1', 'OD')
    expect(pts.map((p) => [p.sample_no, p.observed])).toEqual([[1, 50], [2, 50.2], [3, 50.1]])
    expect(seriesLabel(pts[2], true, () => '16-Nov')).toBe('16-Nov · S3')
    expect(seriesLabel(pts[2], false, () => '16-Nov')).toBe('16-Nov')
  })
  it('parameter result per inspection: any Not Accepted sample -> NG', () => {
    const m = parameterResultsByLog([
      { quality_log_id: 7, quality_parameter: 'OD', result: 'Accepted' },
      { quality_log_id: 7, quality_parameter: 'OD', result: 'Not Accepted' },
      { quality_log_id: 7, quality_parameter: 'ID', result: 'Accepted' },
    ])
    expect(m.get('7|OD')).toBe('NG')
    expect(m.get('7|ID')).toBe('OK')
  })
})

describe('Jobwork QC gate (055) with samples', () => {
  it('one Not OK sample rejects the inspection -> receipt rejected; a later all-OK inspection passes it', () => {
    const first = inspectionResultFromReadings([{ result: 'Accepted' }, { result: 'Not Accepted' }, { result: 'Accepted' }])
    const second = inspectionResultFromReadings([{ result: 'Accepted' }, { result: 'Accepted' }])
    expect([first, second, inspectionResultFromReadings([])]).toEqual(['Rejected', 'Accepted', 'No readings'])
    const receipt = { id: 8 }
    const one = [{ id: 1, receipt_id: 8, log_date: '2026-11-16', inspection_result: first }]
    expect(receiptQcState(receipt, { qcLogs: one })).toBe('rejected')
    const two = [...one, { id: 2, receipt_id: 8, log_date: '2026-11-17', inspection_result: second }]
    expect(receiptQcState(receipt, { qcLogs: two })).toBe('passed')
  })
})
