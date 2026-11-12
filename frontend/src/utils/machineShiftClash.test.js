import { describe, it, expect } from 'vitest'
import { machineShiftClash, clashAllowsStart, otherLogSlots, slotBlockedByOtherLog, runningLogOnMachine, MAX_HOUR_SLOT } from './machineShiftClash'
import { normalizeOptions, keyAction } from './searchableSelect'

// 12 h gross, 60 min break -> 11 net
const SHIFT = { shift_code: 'SHIFT-A', start_time: '8:00 AM', end_time: '8:00 PM', lunch_break_duration: '60 min' }
const rows = (slots, prd = 'PRD-002', logId = 5, lunch = 0) => slots.map((s) => ({ log_id: logId, prd_no: prd, hour_slot: s, lunch }))
const base = { machineId: 'MC-012', machineLabel: 'MC-012', logDate: '2026-11-12', shift: SHIFT }

describe('machineShiftClash', () => {
  it('running: another open log on the machine', () => {
    const c = machineShiftClash({ ...base, openLogs: [{ id: 41, prd_no: 'PRD-003', stage_id: 7, machine_id: 'MC-012', stage_seq: 2 }] })
    expect(c.kind).toBe('running')
    expect(c.message).toBe('MC-012 is running PRD-003 Stage 2 (log #41). End that log first.')
    expect(clashAllowsStart(c, { overtimeConfirmed: true })).toBe(false)
  })

  it('running: no stage number when the position is unknown; other machines ignored', () => {
    const logs = [{ id: 41, prd_no: 'PRD-003', stage_id: 7, machine_id: 'MC-012' }, { id: 42, prd_no: 'PRD-004', machine_id: 'MC-001' }]
    expect(machineShiftClash({ ...base, openLogs: logs }).message).toBe('MC-012 is running PRD-003 (log #41). End that log first.')
    expect(machineShiftClash({ ...base, machineId: 'MC-005', openLogs: logs }).kind).toBe('free')
  })

  it('an open log of THIS PRD on a resumable stage is not a clash', () => {
    const logs = [{ id: 41, prd_no: 'PRD-003', stage_id: 7, machine_id: 'MC-012' }]
    expect(runningLogOnMachine(logs, 'MC-012', { prdNo: 'PRD-003', resumableStageIds: [7] })).toBeNull()
    expect(runningLogOnMachine(logs, 'MC-012', { prdNo: 'PRD-003', resumableStageIds: [8] })?.id).toBe(41)
  })

  it('free: nothing logged', () => {
    const c = machineShiftClash({ ...base, otherRows: [] })
    expect(c.kind).toBe('free')
    expect(c.firstFreeSlot).toBe(1)
    expect(clashAllowsStart(c)).toBe(true)
  })

  it('partial: hrs left, PRDs in slot order, first free hour', () => {
    const c = machineShiftClash({ ...base, otherRows: [...rows([3], 'PRD-007', 6), ...rows([1, 2], 'PRD-003', 5)] })
    expect(c.kind).toBe('partial')
    expect(c.message).toBe('SHIFT-A on MC-012 for 12-11-2026: 8 of 11 net hrs left (3 used by PRD-003, PRD-007). New hours start at hour 4.')
    expect(clashAllowsStart(c)).toBe(true)
  })

  it('partial counts lunch (net hours, 046 rules)', () => {
    const c = machineShiftClash({ ...base, otherRows: [...rows([1, 2, 3, 4, 5]), ...rows([6], 'PRD-002', 5, 60)] })
    expect(c.kind).toBe('partial')
    expect(c.message).toContain('6 of 11 net hrs left (5 used by PRD-002)')
    expect(c.firstFreeSlot).toBe(7)
  })

  it('full by net hours: operator blocked; supervisor may start as overtime (slot 12 free)', () => {
    const other = rows([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    const op = machineShiftClash({ ...base, otherRows: other })
    expect(op.kind).toBe('full')
    expect(op.message).toBe('SHIFT-A on MC-012 for 12-11-2026 is fully used (11 of 11 hrs by PRD-002). Pick another machine or shift.')
    expect(op.overtimeAllowed).toBe(false)
    expect(clashAllowsStart(op, { overtimeConfirmed: true })).toBe(false)
    const sup = machineShiftClash({ ...base, otherRows: other, canOvertime: true })
    expect(sup.overtimeAllowed).toBe(true)
    expect(clashAllowsStart(sup)).toBe(false)
    expect(clashAllowsStart(sup, { overtimeConfirmed: true })).toBe(true)
  })

  it('full because no slot is left after the last used one (option (a): no overtime, even for a supervisor)', () => {
    const c = machineShiftClash({ ...base, otherRows: rows([2, MAX_HOUR_SLOT]), canOvertime: true })
    expect(c.kind).toBe('full')
    expect(c.slotLeft).toBe(false)
    expect(c.overtimeAllowed).toBe(false)
    expect(c.message).toBe('SHIFT-A on MC-012 for 12-11-2026 is fully used (2 of 11 hrs by PRD-002). No hour slot is left after hour 12. Pick another machine or shift.')
  })

  it('no clash result (lookup failed / not checked) never blocks', () => {
    expect(clashAllowsStart(null)).toBe(true)
  })
})

describe('other logs\' slots (grid rule: new hours after the last used slot)', () => {
  const info = otherLogSlots([...rows([1, 2], 'PRD-003'), ...rows([4], 'PRD-007', 6)])
  it('collects used slots + last slot', () => {
    expect(info.lastSlot).toBe(4)
    expect(info.bySlot.get(1)).toEqual(['PRD-003'])
  })
  it('used slot / gap before the last used slot are closed; after it open; own saved slot always open', () => {
    expect(slotBlockedByOtherLog(1, info)).toBe('used by PRD-003')
    expect(slotBlockedByOtherLog(3, info)).toBe("before PRD-007's last hour")
    expect(slotBlockedByOtherLog(5, info)).toBeNull()
    expect(slotBlockedByOtherLog(3, info, new Set([3]))).toBeNull()
    expect(slotBlockedByOtherLog(3, null)).toBeNull()
  })
})

describe('SearchableSelect disabled options', () => {
  it('normalizeOptions keeps disabled; Enter never picks a disabled option', () => {
    const opts = normalizeOptions([{ value: 'MC01', label: 'CNC 1' }, { value: 'MC02', label: 'CNC 2 — busy', disabled: true }])
    expect(opts[1]).toEqual({ value: 'MC02', label: 'CNC 2 — busy', disabled: true })
    expect(opts[0]).toEqual({ value: 'MC01', label: 'CNC 1' })
    expect(keyAction('Enter', { open: true, highlight: 1 }, opts).pick).toBeUndefined()
    expect(keyAction('Enter', { open: true, highlight: 0 }, opts).pick).toEqual(opts[0])
  })
})
