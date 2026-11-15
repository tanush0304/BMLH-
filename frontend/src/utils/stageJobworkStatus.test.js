// 2026-11-15: an outsourced stage's jobwork status follows its own DCs --
// Received once every (non-voided) DC is back (received >= DC qty, or
// Closed Short); qty not yet sent out never makes it "Partially Received".
// Before, any stage with something back stayed Partial until the stored stage
// status turned Received (which also needs the previous stage Completed).
import { describe, it, expect } from 'vitest'
import { stageJobworkStatus, outsourcedStageLabel, outsourcedStageStatus, stageSentText, dcIsBack, buildJobRouteCardRows } from './jobRouteCard'

const dc = (dc_no, qty, qty_received, extra = {}) => ({ dc_no, stage_id: 1, qty, qty_received, ...extra })
const pending = { id: 1, seq: 6, type: 'Outsourced', status: 'Pending' }

describe('stageJobworkStatus (per DC)', () => {
  it('full: received = DC qty -> Received (PRD-012 stage 4: DC-008 411/411, PRD qty 500)', () => {
    expect(stageJobworkStatus([dc('DC-008', 411, 411)])).toBe('Received')
    expect(outsourcedStageLabel(pending, [dc('DC-008', 411, 411)])).toBe('Received')
  })
  it('partial: 0 < received < DC qty -> Partially Received (PRD-009 stage 7: DC-003 134/138)', () => {
    expect(stageJobworkStatus([dc('DC-003', 138, 134)])).toBe('Partially Received')
  })
  it('none back -> Sent; no DC -> Not Sent', () => {
    expect(stageJobworkStatus([dc('DC-1', 200, null)])).toBe('Sent')
    expect(stageJobworkStatus([dc('DC-1', 200, 0)])).toBe('Sent')
    expect(stageJobworkStatus([])).toBe('Not Sent')
  })
  it('closed short counts as back', () => {
    const short = dc('DC-5', 200, 150, { closed_short_at: '2026-11-10', status: 'Closed Short' })
    expect(dcIsBack(short)).toBe(true)
    expect(stageJobworkStatus([short])).toBe('Received')
    expect(stageJobworkStatus([dc('DC-6', 100, 0, { status: 'Closed Short' })])).toBe('Received')
  })
  it('a voided DC is left out', () => {
    expect(stageJobworkStatus([dc('DC-1', 200, 200), dc('DC-2', 100, 0, { voided_at: '2026-11-11' })])).toBe('Received')
    expect(stageJobworkStatus([dc('DC-2', 100, 0, { voided_at: '2026-11-11' })])).toBe('Not Sent')
  })
  it('several DCs on one stage: Received only when every DC is back', () => {
    // PRD-010 stage 6: DC-004 353/353 + DC-006 46/46
    expect(stageJobworkStatus([dc('DC-004', 353, 353), dc('DC-006', 46, 46)])).toBe('Received')
    expect(stageJobworkStatus([dc('DC-004', 353, 353), dc('DC-006', 46, 20)])).toBe('Partially Received')
    expect(stageJobworkStatus([dc('DC-004', 353, 353), dc('DC-006', 46, 0)])).toBe('Partially Received')
    expect(stageJobworkStatus([dc('DC-004', 353, 0), dc('DC-006', 46, 0)])).toBe('Sent')
  })
  it('a stage the DB marked Received stays Received', () => {
    expect(outsourcedStageLabel({ ...pending, status: 'Received' }, [dc('DC-1', 200, 0)])).toBe('Received')
  })
})

describe('qty not yet sent is separate info, never "Partial"', () => {
  it('200 of 500 sent, all 200 back -> Received + "300 not sent yet"', () => {
    const dcs = [dc('DC-1', 200, 200)]
    expect(stageJobworkStatus(dcs)).toBe('Received')
    expect(stageSentText(dcs, 300)).toBe('200 sent · 200 received · 300 not sent yet')
    expect(stageSentText(dcs, 0)).toBe('200 sent · 200 received')
    expect(stageSentText([], 500)).toBe('500 not sent yet')
  })
})

describe('Job Route Card rows', () => {
  it('outsourced stage with every DC back shows Received (N of N back)', () => {
    const rows = buildJobRouteCardRows({
      card: { prd_no: 'PRD-010', batch_qty: 500, shift_hours: 8 },
      stages: [pending],
      jobWorkTypes: [],
      dispatches: [dc('DC-004', 353, 353), dc('DC-006', 46, 46)],
    })
    expect(rows[0].status).toBe('Received (399 of 399 back)')
    expect(outsourcedStageStatus(pending, [dc('DC-003', 138, 134)])).toBe('Partially Received (134 of 138 back)')
  })
})
