import { describe, it, expect } from 'vitest'
import { toNumberOrNull, withNumericFields } from './numericFields'

describe('toNumberOrNull', () => {
  it('turns blanks into null', () => {
    expect(toNumberOrNull('')).toBeNull()
    expect(toNumberOrNull('  ')).toBeNull()
    expect(toNumberOrNull(null)).toBeNull()
    expect(toNumberOrNull(undefined)).toBeNull()
    expect(toNumberOrNull('abc')).toBeNull()
  })
  it('keeps real numbers, including 0', () => {
    expect(toNumberOrNull('0')).toBe(0)
    expect(toNumberOrNull('12.5')).toBe(12.5)
    expect(toNumberOrNull(7)).toBe(7)
  })
})

describe('withNumericFields', () => {
  it('converts only the listed keys and leaves text alone', () => {
    expect(withNumericFields({ a: '', b: '3', name: '' }, ['a', 'b'])).toEqual({ a: null, b: 3, name: '' })
  })
  it('uses 0 for zeroIfBlank keys', () => {
    expect(withNumericFields({ s: '' }, ['s'], { zeroIfBlank: ['s'] })).toEqual({ s: 0 })
  })
  it('does not add keys that are not in the payload', () => {
    expect(withNumericFields({ a: '1' }, ['a', 'missing'])).toEqual({ a: 1 })
  })
})
