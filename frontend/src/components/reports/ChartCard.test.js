import { describe, expect, it } from 'vitest'
import { CATEGORY_PALETTE, categoryColor, categoryLineColor } from './ChartCard'

describe('machine category colours', () => {
  it('assigns palette colours in order, whatever the category names', () => {
    expect([0, 1, 2, 3].map(categoryColor)).toEqual(CATEGORY_PALETTE.slice(0, 4))
    expect(categoryColor(CATEGORY_PALETTE.length)).toBe(CATEGORY_PALETTE[0])
  })

  it('gives the efficiency line a different colour from its bars', () => {
    for (let i = 0; i < 12; i++) expect(categoryLineColor(i)).not.toBe(categoryColor(i))
  })
})
