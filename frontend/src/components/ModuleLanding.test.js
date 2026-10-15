import { describe, expect, it } from 'vitest'
import { landingGrid } from './ModuleLanding'

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
