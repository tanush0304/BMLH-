import { describe, it, expect } from 'vitest'
import { stageAcceptedQty, acceptedFromHour, wipReceiptAvailable, fgReceiptLimits, lastStage, qtyOverLimitError } from './qtyLimits'
import { computeStageAvailability, computeStageUpstreamTargets } from './calculations'

describe('accepted qty', () => {
  it('is produced − rejected − rework per hour', () => {
    expect(acceptedFromHour({ qty_produced: 10, qty_rejected: 1, qty_rework: 0 })).toBe(9)
    expect(acceptedFromHour({ qty_produced: '8', qty_rejected: '', qty_rework: '1' })).toBe(7)
    expect(acceptedFromHour({ qty_produced: 1, qty_rejected: 2, qty_rework: 0 })).toBe(0)
  })
  it('reads accepted from aggregates, falling back to output', () => {
    expect(stageAcceptedQty({ s1: { output: 20, accepted: 18 } }, 's1')).toBe(18)
    expect(stageAcceptedQty({ s1: { output: 5 } }, 's1')).toBe(5)
    expect(stageAcceptedQty({}, 's1')).toBe(0)
  })
})

describe('E2E #4: next stage gets the previous stage ACCEPTED qty', () => {
  const stages = [{ id: 's1', seq: 1 }, { id: 's2', seq: 2 }]
  // Stage 1: 20 produced incl. 1 rejected + 1 rework -> 18 accepted
  const aggregates = { s1: { output: 20, accepted: 18, consumed: 20 } }
  it('target and availability for stage 2 are 18, not 20', () => {
    expect(computeStageUpstreamTargets(stages, 20, aggregates).s2).toBe(18)
    expect(computeStageAvailability(stages, 20, aggregates).s2).toBe(18)
  })
  it('stage 1 still starts from the order qty', () => {
    expect(computeStageUpstreamTargets(stages, 20, aggregates).s1).toBe(20)
  })
})

describe('E2E #5: WIP Receipt ceiling', () => {
  it('stage accepted minus already received', () => {
    expect(wipReceiptAvailable({ stageAccepted: 20, alreadyReceived: 0 })).toBe(20)
    expect(wipReceiptAvailable({ stageAccepted: 20, alreadyReceived: 18 })).toBe(2)
    expect(wipReceiptAvailable({ stageAccepted: 20, alreadyReceived: 25 })).toBe(0)
    // The next stage already took pieces straight from this stage.
    expect(wipReceiptAvailable({ stageAccepted: 48, alreadyReceived: 0, nextConsumed: 48, issuedIntoNext: 0 })).toBe(0)
    expect(wipReceiptAvailable({ stageAccepted: 48, alreadyReceived: 0, nextConsumed: 30, issuedIntoNext: 0 })).toBe(18)
    // What WIP issued into the next stage was not taken from this stage directly.
    expect(wipReceiptAvailable({ stageAccepted: 48, alreadyReceived: 5, nextConsumed: 48, issuedIntoNext: 5 })).toBe(0)
    expect(wipReceiptAvailable({ stageAccepted: 48, alreadyReceived: 10, nextConsumed: 40, issuedIntoNext: 5 })).toBe(3)
    expect(wipReceiptAvailable({ stageAccepted: 10, alreadyReceived: 0, nextConsumed: 3, issuedIntoNext: 8 })).toBe(10)
  })
  it('blocks 25 > 20', () => {
    expect(qtyOverLimitError(25, 20, 'Qty', 'available to receive')).toBe('Qty (25) is more than available to receive (20).')
    expect(qtyOverLimitError(20, 20, 'Qty', 'available to receive')).toBeNull()
  })
})

describe('E2E #6: Jobwork Dispatch ceiling', () => {
  it('blocks 30 > 19', () => {
    expect(qtyOverLimitError(30, 19, 'Dispatch qty', 'available')).toMatch(/30.*19/)
    expect(qtyOverLimitError(19, 19, 'Dispatch qty', 'available')).toBeNull()
  })
})

describe('E2E #7: FG Receipt ceilings', () => {
  it('takes the smaller of production and order balance', () => {
    expect(fgReceiptLimits({ lastStageAccepted: 18, orderQty: 20, fgReceived: 0 })).toEqual({ fromProduction: 18, fromOrder: 20, max: 18 })
    expect(fgReceiptLimits({ lastStageAccepted: 30, orderQty: 20, fgReceived: 5 })).toEqual({ fromProduction: 25, fromOrder: 15, max: 15 })
    // 030: PO line 1600 split into PRDs; 1500 already received on the line's other PRDs
    expect(fgReceiptLimits({ lastStageAccepted: 500, orderQty: 1600, fgReceived: 0, lineFgReceived: 1500 })).toEqual({ fromProduction: 500, fromOrder: 100, max: 100 })
    expect(fgReceiptLimits({ lastStageAccepted: 10, orderQty: 20, fgReceived: 12 })).toEqual({ fromProduction: 0, fromOrder: 8, max: 0 })
  })
  it('blocks 100 > 20-order', () => {
    const { max } = fgReceiptLimits({ lastStageAccepted: 18, orderQty: 20, fgReceived: 0 })
    expect(qtyOverLimitError(100, max, 'Quantity received', 'the allowed maximum')).not.toBeNull()
  })
  it('lastStage picks the highest seq', () => {
    expect(lastStage([{ id: 'a', seq: 2 }, { id: 'b', seq: 3 }, { id: 'c', seq: 1 }]).id).toBe('b')
    expect(lastStage([])).toBeNull()
  })
})
