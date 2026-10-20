import { describe, expect, it } from 'vitest'
import { landingGrid, tileColumnStart } from './ModuleLanding'

describe('landingGrid', () => {
  it('chooses columns by tile count', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => landingGrid(n))).toEqual([
      { cols: 1, rows: 1 },
      { cols: 2, rows: 1 },
      { cols: 3, rows: 1 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 4, rows: 2 },
      { cols: 4, rows: 2 },
      { cols: 4, rows: 3 },
    ])
  })
})

describe('tileColumnStart', () => {
  const starts = (count) => {
    const { cols } = landingGrid(count)
    return Array.from({ length: count }, (_, i) => tileColumnStart(i, count, cols))
  }
  it('centres a short last row by pushing its first tile in', () => {
    expect(starts(5)).toEqual(['auto', 'auto', 'auto', 2, 'auto'])
    expect(starts(7)).toEqual(['auto', 'auto', 'auto', 'auto', 2, 'auto', 'auto'])
  })
  it('leaves full grids alone', () => {
    expect(starts(4)).toEqual(['auto', 'auto', 'auto', 'auto'])
    expect(starts(6).every((s) => s === 'auto')).toBe(true)
    expect(starts(3).every((s) => s === 'auto')).toBe(true)
  })
})
