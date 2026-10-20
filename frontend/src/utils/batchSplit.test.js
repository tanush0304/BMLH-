import { describe, expect, it } from 'vitest'
import { suggestSplit, validateSplit, lineProgressLabel } from './batchSplit'

describe('suggestSplit', () => {
  it('splits by the master batch size, last batch = remainder', () => {
    expect(suggestSplit(1600, 500)).toEqual([500, 500, 500, 100])
    expect(suggestSplit(1000, 500)).toEqual([500, 500])
    expect(suggestSplit(300, 500)).toEqual([300])
  })
  it('one PRD when there is no batch size, nothing when nothing is left', () => {
    expect(suggestSplit(1600, null)).toEqual([1600])
    expect(suggestSplit(0, 500)).toEqual([])
  })
})

describe('validateSplit', () => {
  const rows = (qtys, planCount) => qtys.map((qty, i) => ({ qty, plan: i < planCount }))
  it('accepts a split equal to the remaining qty with some batches ticked', () => {
    const r = validateSplit(rows([500, 500, 500, 100], 2), 1600, 500)
    expect(r.errors).toEqual([])
    expect(r.planned).toEqual([500, 500])
    expect(r.plannedTotal).toBe(1000)
  })
  it('blocks a total that differs from the remaining qty, zero batches, nothing ticked', () => {
    expect(validateSplit(rows([500, 500], 1), 1600, 500).errors[0]).toMatch(/total 1000 but 1600/)
    expect(validateSplit(rows([1600, 0], 1), 1600, 500).errors).toContain('Every batch qty must be greater than 0.')
    expect(validateSplit(rows([1600], 0), 1600, 500).errors).toContain('Tick at least one batch to plan now.')
  })
  it('only warns when a batch is above the master size', () => {
    const r = validateSplit(rows([800, 800], 2), 1600, 500)
    expect(r.errors).toEqual([])
    expect(r.warnings[0]).toMatch(/800, 800 is above .* \(500\)/)
  })
})

describe('lineProgressLabel', () => {
  it('shows active, cancelled (only when any) and planned of the line qty', () => {
    expect(lineProgressLabel({ activeCount: 3, cancelledCount: 1, plannedQty: 200, orderQty: 1600 })).toBe(
      '3 active · 1 cancelled · 200 of 1600 planned'
    )
    expect(lineProgressLabel({ activeCount: 2, cancelledCount: 0, plannedQty: 100, orderQty: 1600 })).toBe(
      '2 active · 100 of 1600 planned'
    )
  })
})
