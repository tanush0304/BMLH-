import { describe, expect, it } from 'vitest'
import { suggestSplit, validateSplit, lineProgressLabel, masterBatchSizeFor } from './batchSplit'

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
  it('blocks a batch above the master size, on every row (ticked or not)', () => {
    const msg = 'Max batch size for PKH2-0266 is 500 — split into another batch or update the Production Batch Master'
    const r = validateSplit(rows([800, 300, 500], 1), 1600, 500, 'PKH2-0266')
    expect(r.errors).toEqual([msg])
    expect(r.rowErrors).toEqual([msg, null, null])
    const unticked = validateSplit(rows([500, 1100], 1), 1600, 500, 'PKH2-0266')
    expect(unticked.rowErrors).toEqual([null, msg])
    expect(unticked.errors).toContain(msg)
  })
  it('allows a batch equal to the master size', () => {
    const r = validateSplit(rows([500, 500], 2), 1000, 500, 'P1')
    expect(r.errors).toEqual([])
    expect(r.rowErrors).toEqual([null, null])
  })
  it('no batch size -> no limit', () => {
    const r = validateSplit(rows([100000], 1), 100000, null, 'P1')
    expect(r.errors).toEqual([])
    expect(r.rowErrors).toEqual([null])
  })
})

describe('masterBatchSizeFor', () => {
  const master = [
    { part_serial_number: 'P1', production_batch_quantity: 500 },
    { part_serial_number: 'P1', production_batch_quantity: 200 },
    { part_serial_number: 'P1', production_batch_quantity: 0 },
    { part_serial_number: 'P2', production_batch_quantity: null },
  ]
  it('uses the SMALLEST positive size when a part has several rows (same as 038)', () => {
    expect(masterBatchSizeFor(master, 'P1')).toBe(200)
  })
  it('null when the part has no row or no positive size', () => {
    expect(masterBatchSizeFor(master, 'P2')).toBeNull()
    expect(masterBatchSizeFor(master, 'P3')).toBeNull()
    expect(masterBatchSizeFor(master, '')).toBeNull()
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
