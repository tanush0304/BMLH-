import { describe, expect, it } from 'vitest'
import { parsePositiveQuantity, validateDispatchQuantity } from './finishedGoodsValidation'

describe('parsePositiveQuantity', () => {
  it('accepts positive numeric values', () => {
    expect(parsePositiveQuantity('12')).toBe(12)
    expect(parsePositiveQuantity('0.25')).toBe(0.25)
    expect(parsePositiveQuantity(3)).toBe(3)
  })

  it.each(['', '  ', '0', '-1', 'NaN', 'Infinity', '-Infinity', '0x10', 'not a number', null, undefined])(
    'rejects invalid or non-positive quantity %s',
    (value) => {
      expect(parsePositiveQuantity(value)).toBeNull()
    }
  )
})

describe('validateDispatchQuantity', () => {
  it('accepts a quantity within both the PRD stock and order balance', () => {
    expect(validateDispatchQuantity('4', 10, 6)).toEqual({ quantity: 4, error: null })
  })

  it('rejects dispatch above the physical stock for the PRD', () => {
    expect(validateDispatchQuantity('7', 6, 10).error).toMatch(/physical FG stock/i)
  })

  it('rejects dispatch above the remaining order quantity for the PRD', () => {
    expect(validateDispatchQuantity('7', 10, 6).error).toMatch(/remaining order quantity/i)
  })

  it('rejects when either PRD limit is unavailable or invalid', () => {
    expect(validateDispatchQuantity('1', null, 6).error).toMatch(/unavailable/i)
    expect(validateDispatchQuantity('1', 6, Number.POSITIVE_INFINITY).error).toMatch(/unavailable/i)
  })
})
