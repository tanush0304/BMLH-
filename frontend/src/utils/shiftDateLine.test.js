import { describe, expect, it } from 'vitest'
import { shiftDateLine } from './shiftDateLine'

const shifts = [
  { shift_code: 'SHIFT-A', shift_name: 'Shift A', start_time: '8:30', end_time: '8:30 PM' },
  { shift_code: 'SHIFT-B', shift_name: 'Shift B', start_time: '8:30 PM', end_time: '8:30 AM' },
  { shift_code: 'SHIFT-C', shift_name: null, start_time: null, end_time: null },
]

describe('shiftDateLine', () => {
  it('date + shift name + start–end', () => {
    expect(shiftDateLine({ date: '2026-10-20', shiftCode: 'SHIFT-A', shifts })).toBe('Date: 2026-10-20 · Shift A (8:30 AM – 8:30 PM)')
  })
  it('uses the given date (e.g. correcting a rejected shift on an earlier day)', () => {
    expect(shiftDateLine({ date: '2026-10-15', shiftCode: 'SHIFT-B', shifts })).toBe('Date: 2026-10-15 · Shift B (8:30 PM – 8:30 AM)')
  })
  it('falls back to the code without times, date only without a shift, blank without a date', () => {
    expect(shiftDateLine({ date: '2026-10-20', shiftCode: 'SHIFT-C', shifts })).toBe('Date: 2026-10-20 · SHIFT-C')
    expect(shiftDateLine({ date: '2026-10-20', shiftCode: '', shifts })).toBe('Date: 2026-10-20')
    expect(shiftDateLine({ date: '', shiftCode: 'SHIFT-A', shifts })).toBe('')
  })
})
