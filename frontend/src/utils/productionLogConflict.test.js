import { describe, it, expect } from 'vitest'
import { isMachineBusyError, machineBusyMessage } from './productionLogConflict'

describe('isMachineBusyError', () => {
  it('recognises the one-open-log-per-machine index', () => {
    expect(isMachineBusyError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "production_logs_one_open_per_machine"',
    })).toBe(true)
  })
  it('treats any other 23505 (same stage) and other errors as not machine-busy', () => {
    expect(isMachineBusyError({ code: '23505', message: 'duplicate key value violates unique constraint "production_logs_open_stage"' })).toBe(false)
    expect(isMachineBusyError({ code: '42501', message: 'production_logs_one_open_per_machine' })).toBe(false)
    expect(isMachineBusyError(null)).toBe(false)
  })
})

describe('machineBusyMessage', () => {
  it('names the machine, PRD and stage', () => {
    expect(machineBusyMessage({
      machine: { machine_name: 'VMC-2' },
      machineId: 'M02',
      openLog: { prd_no: 'PRD-014' },
      stage: { seq: 4, operation: 'Toughening' },
    })).toBe('VMC-2 already has an open log (PRD PRD-014, Stage 4 – Toughening). End or complete that log first.')
  })
  it('falls back to the machine id and no detail when the open log cannot be read', () => {
    expect(machineBusyMessage({ machineId: 'M02' })).toBe('M02 already has an open log. End or complete that log first.')
  })
})
