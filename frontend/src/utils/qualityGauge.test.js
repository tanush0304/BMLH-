// 048 Gauge checks: display helpers + report helpers.
import { describe, it, expect } from 'vitest'
import { isGaugeRow, gaugeResultLabel, readingValueText, readingResultText } from './qualityResult'
import { parameterSeries, gaugeSummary } from './reportQuality'

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
