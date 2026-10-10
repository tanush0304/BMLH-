import { describe, it, expect } from 'vitest'
import { computeLiveLogTotals } from './productionReport'

describe('computeLiveLogTotals', () => {
  it('adds unsaved rows to saved hours', () => {
    const t = computeLiveLogTotals({
      savedHours: [{ qty_produced: 10, qty_rejected: 1, qty_rework: 0 }],
      draftRows: [{ qty_produced: '8', qty_rejected: '', qty_rework: '2' }],
      standardQtyPerHour: 12,
    })
    expect(t).toEqual({ total_produced: 18, total_rejected: 1, total_rework: 2, efficiency_pct: 75, reject_pct: 5.6, rework_pct: 11.1 })
  })
  it('gives null percentages when nothing produced or no standard', () => {
    const t = computeLiveLogTotals({ draftRows: [{ qty_produced: '' }], standardQtyPerHour: null })
    expect(t).toMatchObject({ total_produced: 0, efficiency_pct: null, reject_pct: null, rework_pct: null })
  })
  it('is all zero with no rows', () => {
    expect(computeLiveLogTotals({ standardQtyPerHour: 10 })).toMatchObject({ total_produced: 0, efficiency_pct: null })
  })
})
