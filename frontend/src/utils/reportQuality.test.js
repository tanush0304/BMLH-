import { describe, it, expect } from 'vitest'
import { inspectionCounts, dailyQuality, qualityTrend, toleranceBand, parameterSeries, piecesByInspectionKey, inspectionKey } from './reportQuality'
import { formatLocalISODate } from './dates'

const INSP = [
  { quality_log_id: 1, prd_no: 'P1', stage_id: 10, log_date: '2026-10-01', shift_code: 'A', inspection_result: 'Accepted' },
  { quality_log_id: 2, prd_no: 'P1', stage_id: 10, log_date: '2026-10-01', shift_code: 'A', inspection_result: 'Rejected' },
  { quality_log_id: 3, prd_no: 'P2', stage_id: 20, log_date: '2026-10-02', shift_code: 'B', inspection_result: 'No readings' },
  { quality_log_id: 4, prd_no: 'P2', stage_id: 20, log_date: '2026-10-02', shift_code: 'B', inspection_result: 'Accepted' },
]

describe('inspection counts', () => {
  it('counts No readings but leaves them out of yield', () => {
    expect(inspectionCounts(INSP)).toEqual({
      total: 4, accepted: 2, rejected: 1, noReadings: 1,
      acceptedPct: 50, rejectedPct: 25, noReadingsPct: 25, yield_pct: 66.7,
    })
    expect(inspectionCounts([]).yield_pct).toBeNull()
  })
  it('builds a daily series', () => {
    const d = dailyQuality(INSP, ['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(d.map((x) => [x.accepted, x.rejected, x.noReadings, x.yield_pct])).toEqual([[1, 1, 0, 50], [1, 0, 1, 100], [0, 0, 0, null]])
  })
})

describe('parameter series', () => {
  it('uses standard - lower .. standard + upper', () => {
    expect(toleranceBand({ standard: 50, lower_tolerance: 0.05, upper_tolerance: 0.1 })).toEqual({ min: 49.95, max: 50.1, std: 50 })
    expect(toleranceBand({ standard: null })).toBeNull()
  })
  it('keeps one part + parameter, in date order', () => {
    const readings = [
      { reading_id: 7, quality_log_id: 4, quality_parameter: 'OD', observed_value: 50.2, standard: 50, lower_tolerance: 0.1, upper_tolerance: 0.1, result: 'Not Accepted' },
      { reading_id: 5, quality_log_id: 1, quality_parameter: 'OD', observed_value: 49.98, standard: 50, lower_tolerance: 0.1, upper_tolerance: 0.1, result: 'Accepted' },
      { reading_id: 6, quality_log_id: 1, quality_parameter: 'Length', observed_value: 10, standard: 10, result: 'Accepted' },
    ]
    const byId = new Map(INSP.map((i) => [i.quality_log_id, i]))
    const part = (prd) => (prd === 'P1' ? 'PART-A' : 'PART-B')
    expect(parameterSeries(readings, byId, part, 'PART-A', 'OD')).toEqual([
      { date: '2026-10-01', observed: 49.98, result: 'Accepted', min: 49.9, max: 50.1, std: 50 },
    ])
    expect(parameterSeries(readings, byId, part, 'PART-B', 'OD')[0].observed).toBe(50.2)
  })
})

describe('production pieces', () => {
  it('sums hour groups per prd + stage + date + shift', () => {
    const m = piecesByInspectionKey([
      { prd_no: 'P1', stage_id: 10, log_date: '2026-10-01', shift_code: 'A', produced: 30, rejected: 1, rework: 0 },
      { prd_no: 'P1', stage_id: 10, log_date: '2026-10-01', shift_code: 'A', produced: 12, rejected: 0, rework: 2 },
    ])
    expect(m.get(inspectionKey(INSP[0]))).toEqual({ produced: 42, rejected: 1, rework: 2 })
  })
})

describe('qualityTrend', () => {
  it('switches to months for long periods', () => {
    const days = Array.from({ length: 70 }, (_, k) => formatLocalISODate(new Date(2026, 7, 1 + k)))
    const t = qualityTrend(INSP, days)
    expect(t.map((x) => x.key)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(t[2]).toMatchObject({ total: 4, accepted: 2 })
    expect(qualityTrend(INSP, ['2026-10-01'])[0]).toMatchObject({ key: '2026-10-01', total: 2 })
  })
})
