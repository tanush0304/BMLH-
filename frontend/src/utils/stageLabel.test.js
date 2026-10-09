import { describe, it, expect } from 'vitest'
import { stageLabel } from './stageLabel'
import { filterOptions } from './searchableSelect'

describe('stageLabel', () => {
  it('shows sequence and operation', () => {
    expect(stageLabel({ id: 91, seq: 4, operation: 'Toughening' })).toBe('Stage 4 – Toughening')
    expect(stageLabel({ id: 91, seq: 4, operation: null })).toBe('Stage 4')
  })
  it('is searchable by number and by operation', () => {
    const opts = [{ value: '91', label: stageLabel({ seq: 4, operation: 'Toughening' }) }, { value: '92', label: stageLabel({ seq: 5, operation: 'Plating' }) }]
    expect(filterOptions(opts, '4').map((o) => o.value)).toEqual(['91'])
    expect(filterOptions(opts, 'plat').map((o) => o.value)).toEqual(['92'])
  })
})
