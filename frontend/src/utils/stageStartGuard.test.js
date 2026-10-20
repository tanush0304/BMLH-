import { describe, expect, it } from 'vitest'
import {
  pickDefaultStage, defaultMachineForStage, startSummary, noAvailableMessage,
  earlierIncompleteStage, earlierStageWarning, canStartStage, runningBanner,
} from './stageStartGuard'

const s10 = { id: 1, seq: 10, operation: 'Cutting', type: 'Internal', machine_id: 'MC-001', status: 'Completed' }
const s20 = { id: 2, seq: 20, operation: 'Rough Turning', type: 'Internal', machine_id: 'MC-004', status: 'Pending' }
const s30 = { id: 3, seq: 30, operation: 'Finish Turning', type: 'Internal', machine_id: 'MC-005', status: 'Pending' }
const s25 = { id: 9, seq: 25, operation: 'Deburring', type: 'Manual', status: 'Pending' }

describe('default pick (earliest pending stage with available > 0)', () => {
  it('picks the earliest stage in route order that has something available', () => {
    expect(pickDefaultStage([s30, s20], { 2: 198, 3: 0 })).toBe(s20)
    expect(pickDefaultStage([s30, s20], { 2: 0, 3: 40 })).toBe(s30)
  })
  it('null when nothing is available', () => {
    expect(pickDefaultStage([s20, s30], { 2: 0, 3: 0 })).toBeNull()
    expect(pickDefaultStage([], {})).toBeNull()
  })
  it("machine = the stage's own (planned) machine when eligible, else the first eligible for its seq", () => {
    const rows = [{ machine_id: 'MC-006', seq: 20 }, { machine_id: 'MC-004', seq: 20 }, { machine_id: 'MC-005', seq: 30 }]
    expect(defaultMachineForStage(s20, rows)).toBe('MC-004')
    expect(defaultMachineForStage({ ...s20, machine_id: 'MC-099' }, rows)).toBe('MC-006')
    expect(defaultMachineForStage(null, rows)).toBe('')
  })
})

describe('summary + available-0 block', () => {
  it('summary line with and without a machine', () => {
    expect(startSummary({ stage: s20, machineLabel: 'CNC 1 (MC-004)', available: 198 })).toBe('Stage 20 – Rough Turning on CNC 1 (MC-004) · Available: 198')
    expect(startSummary({ stage: s25, available: 0 })).toBe('Stage 25 – Deburring · Available: 0')
  })
  it('Start is blocked when nothing is available, with the message', () => {
    expect(canStartStage({ available: 0, earlierIncomplete: null, confirmed: false })).toBe(false)
    expect(canStartStage({ available: null })).toBe(false)
    expect(noAvailableMessage(s30)).toBe('Nothing available for Stage 30 yet — the previous stage has not produced accepted pieces.')
  })
})

describe('earlier stage not complete -> warning + confirm', () => {
  it('finds the nearest earlier stage that is not Completed / Received', () => {
    expect(earlierIncompleteStage([s10, s20, s30], s30)).toBe(s20)
    expect(earlierIncompleteStage([s10, s20, s30], s20)).toBeNull()
    expect(earlierIncompleteStage([s10, { ...s20, status: 'Received' }, s30], s30)).toBeNull()
    expect(earlierIncompleteStage([s10, s20, s25, s30], s30)).toBe(s25)
  })
  it('warning text and Start needs the tick', () => {
    expect(earlierStageWarning(s20)).toBe('Stage 20 – Rough Turning is not complete yet. Starting a later stage now is allowed only for partial batches.')
    expect(canStartStage({ available: 50, earlierIncomplete: s20, confirmed: false })).toBe(false)
    expect(canStartStage({ available: 50, earlierIncomplete: s20, confirmed: true })).toBe(true)
    expect(canStartStage({ available: 50, earlierIncomplete: null, confirmed: false })).toBe(true)
  })
})

describe('running banner', () => {
  it('stage + machine; stage only on Manual Ops', () => {
    expect(runningBanner({ stage: { seq: 3, operation: 'VMC Milling' }, machineLabel: 'VMC 2 (MC-011)' })).toBe('Running: Stage 3 – VMC Milling on VMC 2 (MC-011)')
    expect(runningBanner({ stage: s25 })).toBe('Running: Stage 25 – Deburring')
  })
})
