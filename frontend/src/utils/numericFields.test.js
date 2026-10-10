import { describe, it, expect } from 'vitest'
import {
  toNumberOrNull,
  toBooleanOrNull,
  toDateOrNull,
  toTextOrNull,
  withNumericFields,
  withTypedFields,
  isBooleanField,
  typedKeysFromFields,
} from './numericFields'

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

describe('toBooleanOrNull', () => {
  it('maps true/false values and strings', () => {
    expect(toBooleanOrNull(true)).toBe(true)
    expect(toBooleanOrNull(false)).toBe(false)
    expect(toBooleanOrNull('true')).toBe(true)
    expect(toBooleanOrNull('false')).toBe(false)
    expect(toBooleanOrNull(' TRUE ')).toBe(true)
  })
  it('turns blank and anything else into null (not false)', () => {
    expect(toBooleanOrNull('')).toBeNull()
    expect(toBooleanOrNull(null)).toBeNull()
    expect(toBooleanOrNull(undefined)).toBeNull()
    expect(toBooleanOrNull('yes')).toBeNull()
  })
})

describe('toDateOrNull', () => {
  it('turns blanks into null and keeps dates', () => {
    expect(toDateOrNull('')).toBeNull()
    expect(toDateOrNull('  ')).toBeNull()
    expect(toDateOrNull(null)).toBeNull()
    expect(toDateOrNull('2026-10-01')).toBe('2026-10-01')
  })
})

describe('withTypedFields', () => {
  it('converts numeric, boolean and date keys and leaves text alone', () => {
    const out = withTypedFields(
      { qty: '', opening: '', gst: '', tds: 'false', joined: '', due: '2026-11-15', name: '' },
      { numeric: ['qty', 'opening'], boolean: ['gst', 'tds'], date: ['joined', 'due'], zeroIfBlank: ['opening'] },
    )
    expect(out).toEqual({ qty: null, opening: 0, gst: null, tds: false, joined: null, due: '2026-11-15', name: '' })
  })
  it('does not add missing keys or mutate the input', () => {
    const input = { a: '' }
    expect(withTypedFields(input, { boolean: ['a', 'b'], date: ['c'] })).toEqual({ a: null })
    expect(input).toEqual({ a: '' })
  })
})

describe('isBooleanField / typedKeysFromFields', () => {
  const fields = [
    { key: 'gst_registered', type: 'select', options: ['true', 'false'] },
    { key: 'status', type: 'select', options: ['Active', 'Inactive'] },
    { key: 'joining_date', type: 'date' },
    { key: 'lead_time_days', type: 'number' },
    { key: 'flag', type: 'boolean' },
    { key: 'name' },
  ]
  it('treats a true/false select as boolean', () => {
    expect(isBooleanField(fields[0])).toBe(true)
    expect(isBooleanField(fields[1])).toBe(false)
    expect(isBooleanField(fields[4])).toBe(true)
  })
  it('groups keys by value type', () => {
    expect(typedKeysFromFields(fields)).toEqual({
      numeric: ['lead_time_days'],
      date: ['joining_date'],
      boolean: ['gst_registered', 'flag'],
    })
  })
  it('blank GST Registered / TDS / Joining Date become null in a master payload', () => {
    const form = { gst_registered: '', status: '', joining_date: '', lead_time_days: '', flag: '', name: 'X' }
    expect(withTypedFields(form, typedKeysFromFields(fields))).toEqual({
      gst_registered: null, status: '', joining_date: null, lead_time_days: null, flag: null, name: 'X',
    })
  })
})

describe('YES_NO_OPTIONS', () => {
  it('shows Yes/No but is still detected as a boolean field and saves true/false', async () => {
    const { YES_NO_OPTIONS } = await import('./numericFields')
    expect(YES_NO_OPTIONS.map((o) => o.label)).toEqual(['Yes', 'No'])
    const field = { key: 'gst_registered', type: 'select', options: YES_NO_OPTIONS }
    expect(isBooleanField(field)).toBe(true)
    expect(withTypedFields({ gst_registered: 'true' }, typedKeysFromFields([field]))).toEqual({ gst_registered: true })
    expect(withTypedFields({ gst_registered: 'false' }, typedKeysFromFields([field]))).toEqual({ gst_registered: false })
  })
})

describe('text fields', () => {
  it('toTextOrNull: blank -> null, otherwise trimmed', () => {
    expect(toTextOrNull('')).toBeNull()
    expect(toTextOrNull('  ')).toBeNull()
    expect(toTextOrNull(null)).toBeNull()
    expect(toTextOrNull(' a ')).toBe('a')
  })
  it('withTypedFields converts text keys only', () => {
    expect(withTypedFields({ a: '', b: '', c: ' x ' }, { text: ['a', 'c'] })).toEqual({ a: null, b: '', c: 'x' })
  })
})
