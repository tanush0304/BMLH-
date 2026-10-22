import { describe, it, expect } from 'vitest'
import { releasedPlannedQty, pickOpenLogForScreen, logMatchesScreen, createRequestGate, OUT_OF_SYNC_MESSAGE } from './productionLogLock'
import { acceptedQty } from './productionReport'

describe('releasedPlannedQty', () => {
  it('keeps only what was produced, capped at the reservation', () => {
    expect(releasedPlannedQty(100, [{ qty_produced: 30 }, { qty_produced: 12 }])).toBe(42)
    expect(releasedPlannedQty(40, [{ qty_produced: 30 }, { qty_produced: 12 }])).toBe(40)
    expect(releasedPlannedQty(100, [])).toBe(0)
  })
})

describe('releasedPlannedQty counts every piece processed', () => {
  it('uses qty_produced (= accepted + rejected + rework), not accepted only', () => {
    // 50 processed: 40 accepted + 6 rejected + 4 rework
    const hours = [{ qty_produced: 50, qty_rejected: 6, qty_rework: 4 }]
    expect(acceptedQty(hours[0])).toBe(40)
    expect(releasedPlannedQty(100, hours)).toBe(50)
  })
})

describe('pickOpenLogForScreen', () => {
  const stages = [{ id: 7, seq: 2, operation: 'Turning' }]
  it("returns the newest open log whose stage belongs to this screen", () => {
    const logs = [{ id: 2, stage_id: 99 }, { id: 1, stage_id: 7 }]
    expect(pickOpenLogForScreen(logs, stages)).toEqual({ log: logs[1], stage: stages[0] })
  })
  it('is null when none match', () => {
    expect(pickOpenLogForScreen([{ id: 2, stage_id: 99 }], stages)).toBeNull()
  })
})

describe('logMatchesScreen', () => {
  const log = { prd_no: 'PRD-005', stage_id: 12, machine_id: 'MC01' }

  it('matches PRD, stage and machine (ids compared as text)', () => {
    expect(logMatchesScreen(log, { prdNo: 'PRD-005', stageId: '12', machineId: 'MC01' })).toBe(true)
  })

  it('refuses a different PRD, stage or machine', () => {
    expect(logMatchesScreen(log, { prdNo: 'PRD-006', stageId: 12, machineId: 'MC01' })).toBe(false)
    expect(logMatchesScreen(log, { prdNo: 'PRD-005', stageId: 13, machineId: 'MC01' })).toBe(false)
    expect(logMatchesScreen(log, { prdNo: 'PRD-005', stageId: 12, machineId: 'MC02' })).toBe(false)
    expect(logMatchesScreen(log, { prdNo: 'PRD-005', stageId: 12, machineId: '' })).toBe(false)
  })

  it('skips the machine check when no machineId is given (Manual Operations)', () => {
    expect(logMatchesScreen({ prd_no: 'PRD-005', stage_id: 12, machine_id: null }, { prdNo: 'PRD-005', stageId: 12 })).toBe(true)
  })

  it('refuses a missing log or an empty screen', () => {
    expect(logMatchesScreen(null, { prdNo: 'PRD-005', stageId: 12 })).toBe(false)
    expect(logMatchesScreen(log, {})).toBe(false)
  })

  it('exposes the out-of-sync message', () => {
    expect(OUT_OF_SYNC_MESSAGE).toBe('Screen out of sync, reload the log')
  })
})

describe('createRequestGate', () => {
  it('only the latest token is current', () => {
    const gate = createRequestGate()
    const a = gate.start()
    expect(gate.isCurrent(a)).toBe(true)
    const b = gate.start()
    expect(gate.isCurrent(a)).toBe(false)
    expect(gate.isCurrent(b)).toBe(true)
  })

  it('gates are independent', () => {
    const g1 = createRequestGate()
    const g2 = createRequestGate()
    const t = g1.start()
    g2.start()
    g2.start()
    expect(g1.isCurrent(t)).toBe(true)
  })
})
