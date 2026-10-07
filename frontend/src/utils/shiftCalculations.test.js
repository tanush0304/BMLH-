import { describe, it, expect } from 'vitest'
import { computeShiftHours } from './shiftCalculations'

describe('computeShiftHours', () => {
  it('6:00 AM to 2:00 PM, lunch 30 -> 8 hours / 7.5 hours', () => {
    const r = computeShiftHours({ start_time: '6:00 AM', end_time: '2:00 PM', lunch_break_duration: '30' })
    expect(r.shift_duration).toBe('8 hours')
    expect(r.net_working_hours).toBe('7.5 hours')
    expect(r.error).toBeNull()
  })

  it('10:00 PM to 6:00 AM (past midnight), lunch 30 -> 8 hours / 7.5 hours', () => {
    const r = computeShiftHours({ start_time: '10:00 PM', end_time: '6:00 AM', lunch_break_duration: '30 min' })
    expect(r.shift_duration).toBe('8 hours')
    expect(r.net_working_hours).toBe('7.5 hours')
  })

  it('9:00 AM to 5:30 PM, lunch 45 -> 8.5 hours / 7.75 hours', () => {
    const r = computeShiftHours({ start_time: '9:00 AM', end_time: '5:30 PM', lunch_break_duration: '45 mins' })
    expect(r.shift_duration).toBe('8.5 hours')
    expect(r.net_working_hours).toBe('7.75 hours')
  })

  it('12:00 AM to 12:00 PM -> 12 hours', () => {
    const r = computeShiftHours({ start_time: '12:00 AM', end_time: '12:00 PM', lunch_break_duration: '' })
    expect(r.shift_duration).toBe('12 hours')
    expect(r.warning).toBeNull()
  })

  it('12:00 PM to 12:00 AM -> 12 hours', () => {
    const r = computeShiftHours({ start_time: '12:00 PM', end_time: '12:00 AM', lunch_break_duration: '' })
    expect(r.shift_duration).toBe('12 hours')
  })

  it('identical start and end -> blank outputs plus message', () => {
    const r = computeShiftHours({ start_time: '6:00 AM', end_time: '6:00 AM', lunch_break_duration: '30' })
    expect(r.shift_duration).toBe('')
    expect(r.net_working_hours).toBe('')
    expect(r.message).toBe('Start and end time are the same')
  })

  it('lunch longer than duration -> error, no net value', () => {
    const r = computeShiftHours({ start_time: '6:00 AM', end_time: '2:00 PM', lunch_break_duration: '10 hours' })
    expect(r.error).toBeTruthy()
    expect(r.net_working_hours).toBe('')
  })

  it('missing start or end -> blank outputs, no error', () => {
    const r1 = computeShiftHours({ start_time: '', end_time: '2:00 PM', lunch_break_duration: '30' })
    expect(r1.shift_duration).toBe('')
    expect(r1.error).toBeNull()

    const r2 = computeShiftHours({ start_time: '6:00 AM', end_time: '', lunch_break_duration: '30' })
    expect(r2.shift_duration).toBe('')
  })

  it('blank lunch counts as 0', () => {
    const r = computeShiftHours({ start_time: '6:00 AM', end_time: '2:00 PM', lunch_break_duration: '' })
    expect(r.net_working_hours).toBe('8 hours')
  })

  it('accepts "0.5 hour" lunch format', () => {
    const r = computeShiftHours({ start_time: '6:00 AM', end_time: '2:00 PM', lunch_break_duration: '0.5 hour' })
    expect(r.net_working_hours).toBe('7.5 hours')
  })

  it('warns but does not block when duration exceeds 12 hours', () => {
    const r = computeShiftHours({ start_time: '6:00 AM', end_time: '8:00 PM', lunch_break_duration: '30' })
    expect(r.shift_duration).toBe('14 hours')
    expect(r.warning).toBe('Shift is over 12 hours - check AM/PM')
    expect(r.error).toBeNull()
  })

  it('exactly 12 hours does not trigger the warning', () => {
    const r = computeShiftHours({ start_time: '6:00 AM', end_time: '6:00 PM', lunch_break_duration: '' })
    expect(r.shift_duration).toBe('12 hours')
    expect(r.warning).toBeNull()
  })
})
