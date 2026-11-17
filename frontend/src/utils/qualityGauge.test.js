// 048 Gauge checks: display helpers + report helpers.
import { describe, it, expect } from 'vitest'
import { isGaugeRow, gaugeResultLabel, readingValueText, readingResultText, standardText, computeQualityResult } from './qualityResult'
import { parameterSeries, gaugeSummary, readingTarget, formatTarget, toleranceBand } from './reportQuality'

describe('gauge display helpers', () => {
  it('OK -> Accepted, Not OK -> Rejected; value text OK / Not OK; measured rows unchanged', () => {
    expect(gaugeResultLabel('OK')).toBe('Accepted')
    expect(gaugeResultLabel('Not OK')).toBe('Rejected')
    expect(gaugeResultLabel('')).toBeNull()
    const g = { check_type: 'Gauge', gauge_result: 'Not OK', observed_value: null, result: 'Not Accepted' }
    expect(isGaugeRow(g)).toBe(true)
    expect(readingValueText(g)).toBe('Not OK')
    expect(readingResultText(g)).toBe('Rejected')
    const m = { check_type: 'Measured', observed_value: 49.9, result: 'Accepted' }
    expect(readingValueText(m)).toBe(49.9)
    expect(readingResultText(m)).toBe('Accepted')
    expect(isGaugeRow({ observed_value: 1 })).toBe(false) // before 048: no check_type
  })
})

describe('Quality Status report helpers', () => {
  const insp = new Map([[1, { prd_no: 'PRD-1', log_date: '2026-11-10' }], [2, { prd_no: 'PRD-1', log_date: '2026-11-11' }]])
  const part = () => 'P1'
  const readings = [
    { reading_id: 1, quality_log_id: 1, quality_parameter: 'Thread', check_type: 'Gauge', gauge_result: 'OK' },
    { reading_id: 2, quality_log_id: 2, quality_parameter: 'Thread', check_type: 'Gauge', gauge_result: 'Not OK' },
    { reading_id: 3, quality_log_id: 1, quality_parameter: 'OD', check_type: 'Measured', observed_value: 50, standard: 50 },
  ]
  it('gauge parameters are not charted; summary counts OK / Not OK', () => {
    expect(parameterSeries(readings, insp, part, 'P1', 'Thread')).toEqual([])
    expect(parameterSeries(readings, insp, part, 'P1', 'OD')).toHaveLength(1)
    expect(gaugeSummary(readings, insp, part, 'P1', 'Thread')).toEqual({ gauge: true, ok: 1, notOk: 1 })
    expect(gaugeSummary(readings, insp, part, 'P1', 'OD')).toBeNull()
  })
})

describe('standardText (053)', () => {
  it('Measured -> numeric standard; Gauge -> text gauge_standard; blank -> null', () => {
    expect(standardText({ check_type: 'Measured', standard: 50 })).toBe('50')
    expect(standardText({ check_type: 'Measured', standard: 0 })).toBe('0')
    expect(standardText({ check_type: 'Measured', standard: null, gauge_standard: 'X' })).toBeNull()
    expect(standardText({ check_type: 'Gauge', standard: 12, gauge_standard: ' M8x1.25 6H ' })).toBe('M8x1.25 6H')
    expect(standardText({ check_type: 'Gauge', gauge_standard: '  ' })).toBeNull()
    expect(standardText({ check_type: 'Gauge' })).toBeNull() // before 053
    expect(standardText({ standard: 20 })).toBe('20') // before 048
  })
  it('a Gauge standard never decides the result (result = OK / Not OK only)', () => {
    const g = { check_type: 'Gauge', gauge_standard: 'M8x1.25 6H', gauge_result: 'OK', result: 'Accepted' }
    expect(readingResultText(g)).toBe('Accepted')
    expect(readingResultText({ ...g, gauge_result: 'Not OK' })).toBe('Rejected')
    expect(computeQualityResult).toBeTypeOf('function')
  })
})

describe('Quality Status Target (053)', () => {
  it('Measured -> number, Gauge -> text standard (never the numeric standard)', () => {
    expect(readingTarget({ check_type: 'Measured', standard: 1250.5 })).toBe(1250.5)
    expect(readingTarget({ check_type: 'Gauge', standard: 12, gauge_standard: ' M8x1.25 6H ' })).toBe('M8x1.25 6H')
    expect(readingTarget({ check_type: 'Gauge', standard: 12 })).toBeNull() // before 053
    expect(formatTarget(1250.5)).toBe('1,250.5')
    expect(formatTarget('M8x1.25 6H')).toBe('M8x1.25 6H')
    expect(formatTarget(null)).toBe('—')
  })
})

describe('Job Work rows are Gauge (056)', () => {
  const jw = { job_work_code: 'HT', check_type: 'Measured', standard: 30, upper_tolerance: 2, lower_tolerance: 2, gauge_standard: '58-62 HRC' }
  it('isGaugeRow: job_work_code set -> Gauge; blank / null -> by check_type', () => {
    expect(isGaugeRow(jw)).toBe(true)
    expect(isGaugeRow({ job_work_code: '  ', check_type: 'Measured' })).toBe(false)
    expect(isGaugeRow({ job_work_code: null, check_type: 'Gauge' })).toBe(true)
    expect(isGaugeRow({ check_type: 'Measured' })).toBe(false)
  })
  it('Standard / Target = text, no tolerance band', () => {
    expect(standardText(jw)).toBe('58-62 HRC')
    expect(readingTarget(jw)).toBe('58-62 HRC')
    expect(formatTarget(readingTarget(jw))).toBe('58-62 HRC')
    expect(toleranceBand(jw)).toBeNull()
    expect(toleranceBand({ standard: 30, upper_tolerance: 2, lower_tolerance: 1 })).toEqual({ min: 29, max: 32, std: 30 })
  })
})
