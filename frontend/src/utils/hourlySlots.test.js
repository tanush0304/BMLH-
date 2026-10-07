import { describe, it, expect } from 'vitest'
import { generateHourlySlots, resolveEntryShiftTimes, splitHourHistory } from './hourlySlots'

const SHIFTS = [
  { shift_code: 'A', shift_name: 'Shift A', start_time: '6:00 AM', end_time: '2:00 PM' },
  { shift_code: 'B', shift_name: 'Shift B', start_time: '9:00 AM', end_time: '5:00 PM' },
]

describe('generateHourlySlots', () => {
  it('6:00 AM to 2:00 PM -> 8 slots, first "6:00-7:00 AM", last "1:00-2:00 PM"', () => {
    const { slots, capped } = generateHourlySlots({ start_time: '6:00 AM', end_time: '2:00 PM' })
    expect(slots).toHaveLength(8)
    expect(slots[0]).toEqual({ slot: 1, label: '6:00-7:00 AM' })
    expect(slots[7]).toEqual({ slot: 8, label: '1:00-2:00 PM' })
    expect(capped).toBe(false)
  })

  it('10:00 PM to 6:00 AM -> 8 slots, crossing midnight', () => {
    const { slots } = generateHourlySlots({ start_time: '10:00 PM', end_time: '6:00 AM' })
    expect(slots).toHaveLength(8)
    expect(slots[0]).toEqual({ slot: 1, label: '10:00-11:00 PM' })
    expect(slots[1]).toEqual({ slot: 2, label: '11:00 PM-12:00 AM' })
    expect(slots[2]).toEqual({ slot: 3, label: '12:00-1:00 AM' })
    expect(slots[7]).toEqual({ slot: 8, label: '5:00-6:00 AM' })
  })

  it('9:00 AM to 5:30 PM -> 9 slots, last "5:00-5:30 PM"', () => {
    const { slots } = generateHourlySlots({ start_time: '9:00 AM', end_time: '5:30 PM' })
    expect(slots).toHaveLength(9)
    expect(slots[8]).toEqual({ slot: 9, label: '5:00-5:30 PM' })
  })

  it('missing times -> no slots (fallback to manual entry)', () => {
    expect(generateHourlySlots({ start_time: '', end_time: '2:00 PM' }).slots).toEqual([])
    expect(generateHourlySlots({ start_time: '6:00 AM', end_time: '' }).slots).toEqual([])
    expect(generateHourlySlots({ start_time: null, end_time: null }).slots).toEqual([])
  })

  it('identical start and end -> no usable duration, no slots', () => {
    expect(generateHourlySlots({ start_time: '6:00 AM', end_time: '6:00 AM' }).slots).toEqual([])
  })

  it('14-hour shift -> capped at 12 with a warning flag', () => {
    const { slots, capped } = generateHourlySlots({ start_time: '6:00 AM', end_time: '8:00 PM' })
    expect(slots).toHaveLength(12)
    expect(capped).toBe(true)
    expect(slots[11]).toEqual({ slot: 12, label: '5:00-6:00 PM' })
  })
})

describe('resolveEntryShiftTimes', () => {
  it('always uses the dropdown-selected shift, with or without an active log', () => {
    const r = resolveEntryShiftTimes({ dropdownShiftCode: 'B', shifts: SHIFTS })
    expect(r).toMatchObject({ shiftCode: 'B', start_time: '9:00 AM', end_time: '5:00 PM' })
  })

  it('a log created under Shift A does not override a dropdown now pointed at Shift B -- post-migration-010, each hour row carries its own shift, so there is nothing left to mislabel', () => {
    const r = resolveEntryShiftTimes({ dropdownShiftCode: 'B', shifts: SHIFTS })
    expect(r.shiftCode).toBe('B')

    const { slots } = generateHourlySlots({ start_time: r.start_time, end_time: r.end_time })
    const shiftBSlots = generateHourlySlots({ start_time: '9:00 AM', end_time: '5:00 PM' }).slots
    const shiftASlots = generateHourlySlots({ start_time: '6:00 AM', end_time: '2:00 PM' }).slots
    expect(slots).toEqual(shiftBSlots)
    expect(slots).not.toEqual(shiftASlots)
  })
})

describe('splitHourHistory', () => {
  it('a second day with Shift A can reuse slots 1-8 with no collision', () => {
    // Day 1, Shift A, slots 1-8 all logged -- then day 2 opens under Shift A
    // again. Day 2's grid should start fully fresh: nothing in savedToday,
    // day 1's 8 hours collapsed into one history row.
    const logHours = Array.from({ length: 8 }, (_, i) => ({
      hour_slot: i + 1,
      log_date: '2026-01-01',
      shift_code: 'A',
      employee_id: 'OP-001',
      qty_produced: 10,
    }))
    const { savedToday, historyList } = splitHourHistory({ logHours, today: '2026-01-02', shiftCode: 'A' })
    expect(savedToday).toEqual([])
    expect(historyList).toEqual([
      { log_date: '2026-01-01', shift_code: 'A', employees: ['OP-001'], hours: 8, qty: 80 },
    ])
  })

  it('the same shift and day resumed after a partial save shows only the saved slots', () => {
    const logHours = [
      { hour_slot: 1, log_date: '2026-01-01', shift_code: 'A', employee_id: 'OP-001', qty_produced: 5 },
      { hour_slot: 2, log_date: '2026-01-01', shift_code: 'A', employee_id: 'OP-001', qty_produced: 6 },
      { hour_slot: 3, log_date: '2026-01-01', shift_code: 'A', employee_id: 'OP-001', qty_produced: 7 },
    ]
    const { savedToday, historyList } = splitHourHistory({ logHours, today: '2026-01-01', shiftCode: 'A' })
    expect(savedToday.map((h) => h.hour_slot)).toEqual([1, 2, 3])
    expect(historyList).toEqual([])
  })

  it('a different employee on the same log, same day/shift, is still just one saved-today group', () => {
    const logHours = [
      { hour_slot: 1, log_date: '2026-01-01', shift_code: 'A', employee_id: 'OP-001', qty_produced: 5 },
      { hour_slot: 2, log_date: '2026-01-01', shift_code: 'A', employee_id: 'OP-002', qty_produced: 6 },
    ]
    const { savedToday } = splitHourHistory({ logHours, today: '2026-01-01', shiftCode: 'A' })
    expect(savedToday).toHaveLength(2)
    expect(savedToday.map((h) => h.employee_id)).toEqual(['OP-001', 'OP-002'])
  })

  it('a different employee shows up correctly in a history group summary', () => {
    const logHours = [
      { hour_slot: 1, log_date: '2026-01-01', shift_code: 'A', employee_id: 'OP-001', qty_produced: 5 },
      { hour_slot: 2, log_date: '2026-01-01', shift_code: 'A', employee_id: 'OP-002', qty_produced: 6 },
    ]
    const { historyList } = splitHourHistory({ logHours, today: '2026-01-02', shiftCode: 'A' })
    expect(historyList).toEqual([
      { log_date: '2026-01-01', shift_code: 'A', employees: ['OP-001', 'OP-002'], hours: 2, qty: 11 },
    ])
  })
})
