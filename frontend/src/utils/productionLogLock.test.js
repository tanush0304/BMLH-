import { describe, it, expect } from 'vitest'
import { releasedPlannedQty, pickOpenLogForScreen } from './productionLogLock'
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
