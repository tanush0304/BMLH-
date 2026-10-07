import { describe, it, expect } from 'vitest'
import {
  totalIdle,
  validateIdle,
  slotDurations,
  acceptedQty,
  computeReportTotals,
  pickCycleTime,
} from './productionReport'

describe('validateIdle', () => {
  it('blank row is valid (defaults to 0)', () => {
    expect(validateIdle({})).toBeNull()
    expect(totalIdle({})).toBe(0)
  })
  it('total exactly 60 is valid, 61 is not', () => {
    expect(validateIdle({ lunch: 30, breakdown: 30 })).toBeNull()
    expect(validateIdle({ lunch: 30, breakdown: 31 })).toMatch(/exceeds 60/)
  })
  it('rejects negatives and decimals', () => {
    expect(validateIdle({ tool_issue: -1 })).toMatch(/Tool Issue/)
    expect(validateIdle({ mc_clean: '2.5' })).toMatch(/M\/C Clean/)
  })
  it('a short last slot caps idle at its own length', () => {
    expect(validateIdle({ lunch: 40 }, 30)).toMatch(/exceeds 30/)
    expect(validateIdle({ lunch: 30 }, 30)).toBeNull()
  })
})

describe('slotDurations', () => {
  it('9:00 AM-5:30 PM -> 9 slots, last is 30 min', () => {
    const d = slotDurations({ start_time: '9:00 AM', end_time: '5:30 PM' })
    expect(Object.keys(d)).toHaveLength(9)
    expect(d[1]).toBe(60)
    expect(d[9]).toBe(30)
  })
  it('missing times -> empty', () => {
    expect(slotDurations({ start_time: null, end_time: '5:00 PM' })).toEqual({})
  })
})

describe('computeReportTotals', () => {
  it('sums accepted, idle, production time, setting time', () => {
    const rows = [
      { hour_slot: 1, qty_produced: 50, qty_rejected: 2, qty_rework: 1, lunch: 0, breakdown: 10 },
      { hour_slot: 2, qty_produced: '40', qty_rejected: '', qty_rework: 0, lunch: 30 },
      { hour_slot: 9, qty_produced: 10 },
    ]
    const t = computeReportTotals({ rows, durations: { 1: 60, 2: 60, 9: 30 }, settingTimeMin: '25' })
    expect(t).toEqual({ accepted: 97, idleMin: 40, productionMin: 110, settingMin: 25 })
  })
  it('overtime slot with no known length counts as 60', () => {
    expect(computeReportTotals({ rows: [{ hour_slot: 11 }] }).productionMin).toBe(60)
  })
  it('acceptedQty', () => {
    expect(acceptedQty({ qty_produced: 10, qty_rejected: 1, qty_rework: 2 })).toBe(7)
  })
})

describe('pickCycleTime', () => {
  const rows = [
    { part_serial_number: 'P1', seq: 10, machine_id: 'M1', cycle_time_min: 2 },
    { part_serial_number: 'P1', seq: 10, machine_id: 'M2', cycle_time_min: 3 },
    { part_serial_number: 'P1', seq: 20, machine_id: 'M1', cycle_time_min: 5 },
  ]
  it('prefers the exact machine, falls back to part + seq, null when none', () => {
    expect(pickCycleTime(rows, { partSerialNumber: 'P1', seq: 10, machineId: 'M2' })).toBe(3)
    expect(pickCycleTime(rows, { partSerialNumber: 'P1', seq: 10, machineId: 'M9' })).toBe(2)
    expect(pickCycleTime(rows, { partSerialNumber: 'P1', seq: 30, machineId: 'M1' })).toBeNull()
  })
})
