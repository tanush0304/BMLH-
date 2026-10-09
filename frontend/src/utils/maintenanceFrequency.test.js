import { describe, it, expect } from 'vitest'
import { addFrequency, parseIntervalDays, withIntervalDays } from './maintenanceFrequency'

describe('maintenance frequency', () => {
  it('keeps built-in intervals', () => {
    expect(addFrequency('2026-01-01', 'Daily')).toBe('2026-01-02')
    expect(addFrequency('2026-01-01', 'Weekly')).toBe('2026-01-08')
    expect(addFrequency('2026-01-01', 'Fortnightly')).toBe('2026-01-15')
    expect(addFrequency('2026-01-31', 'Monthly')).toBe('2026-02-28')
  })
  it('uses the days stored in a custom frequency', () => {
    expect(parseIntervalDays('Every 45 days')).toBe(45)
    expect(parseIntervalDays('Quarterly (90 days)')).toBe(90)
    expect(parseIntervalDays('Quarterly')).toBeNull()
    expect(addFrequency('2026-01-01', 'Every 45 days')).toBe('2026-02-15')
  })
  it('gives no due date for a custom frequency without days', () => {
    expect(addFrequency('2026-01-01', 'Quarterly')).toBe('')
  })
  it('stores the interval with the frequency text', () => {
    expect(withIntervalDays('Every 45 days', 45)).toBe('Every 45 days')
    expect(withIntervalDays('Quarterly', 90)).toBe('Quarterly (90 days)')
    expect(withIntervalDays('Quarterly (90 days)', 91)).toBe('Quarterly (91 days)')
  })
})
