import { describe, it, expect } from 'vitest'
import { canReopenStage, reopenBlockedMessage, reopenReasonProblem, reopenedNote, materialAvailableText } from './stageReopen'

describe('reopen stage helpers (049)', () => {
  it('canReopenStage: supervisor / admin, 049 run, Completed only', () => {
    expect(canReopenStage({ role: 'supervisor', supported: true, stageStatus: 'Completed' })).toBe(true)
    expect(canReopenStage({ role: 'admin', supported: true, stageStatus: 'Completed' })).toBe(true)
    expect(canReopenStage({ role: 'operator', supported: true, stageStatus: 'Completed' })).toBe(false)
    expect(canReopenStage({ role: 'supervisor', supported: false, stageStatus: 'Completed' })).toBe(false)
    expect(canReopenStage({ role: 'supervisor', supported: true, stageStatus: 'Pending' })).toBe(false)
    expect(canReopenStage({ role: 'supervisor', supported: true, stageStatus: 'Received' })).toBe(false)
  })
  it('messages', () => {
    expect(reopenBlockedMessage({ position: 2, seq: 20, operation: 'Turning' }, ['a', 'b'])).toBe("Can't reopen Stage 2 – Turning: a; b.")
    expect(reopenReasonProblem('  ')).toBe('Enter a reason to reopen the stage.')
    expect(reopenReasonProblem('x')).toBeNull()
    expect(reopenedNote({ reopened_at: '2026-11-12T05:00:00Z', reopened_by: 'u', reopen_reason: 'early' }, () => 'Ravi')).toBe('Reopened by Ravi on 12-11-2026: early')
    expect(reopenedNote({})).toBe('')
  })
})

describe('materialAvailableText', () => {
  it('no log: available, plus "can make" when below target', () => {
    expect(materialAvailableText({ target: 500, available: 500 })).toBe('Material available: 500')
    expect(materialAvailableText({ target: 500, available: 1200 })).toBe('Material available: 1,200')
    expect(materialAvailableText({ target: 500, available: 320 })).toBe('Material available: 320 · can make 320')
    expect(materialAvailableText({ target: 500, available: 0 })).toBe('Material available: 0 · can make 0')
    expect(materialAvailableText({ target: 100000, available: 25000 })).toBe('Material available: 25,000 · can make 25,000')
  })
  it('open log: its own reservation; nothing known -> empty', () => {
    expect(materialAvailableText({ target: 500, available: 0, reserved: 480, logOpen: true })).toBe('Material reserved by this log: 480')
    expect(materialAvailableText({ target: 500, available: null })).toBe('')
    expect(materialAvailableText({ logOpen: true })).toBe('')
  })
})
