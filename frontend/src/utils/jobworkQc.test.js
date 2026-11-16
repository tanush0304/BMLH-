// Quality gate after jobwork (054 / 055) -- JS twin of 055's blockers functions.
import { describe, expect, it } from 'vitest'
import {
  qcGateSettings, qcBlockers, pendingIncomingQc, pendingIncomingQcItems, receiptQcState, latestInspection,
  stagePositionOf, previousJobworkStages, receiptFromMode, qcMode, qualityMachineText, pendingQcText,
} from './jobworkQc'

// PRD-012: 3 Turning (Internal) -> 4 Toughening (Outsourced, seq 40) -> 5 Finish Turning (seq 50)
const STAGES = [
  { id: 1, prd_no: 'PRD-012', seq: 10, type: 'Internal', operation: 'Cutting' },
  { id: 2, prd_no: 'PRD-012', seq: 20, type: 'Internal', operation: 'Rough Turning' },
  { id: 3, prd_no: 'PRD-012', seq: 30, type: 'Internal', operation: 'Drilling' },
  { id: 4, prd_no: 'PRD-012', seq: 40, type: 'Outsourced', operation: 'Toughening', job_work_code: 'HT' },
  { id: 5, prd_no: 'PRD-012', seq: 50, type: 'Internal', operation: 'Finish Turning ONE' },
  { id: 6, prd_no: 'PRD-012', seq: 60, type: 'Internal', operation: 'Grinding' },
]
const ON = { on: true, from: null }
const dc = (dc_no, extra = {}) => ({ dc_no, prd_no: 'PRD-012', stage_id: 4, qty: 411, voided_at: null, ...extra })
const rc = (id, dc_no, extra = {}) => ({ id, dc_no, receipt_no: `JR-${String(id).padStart(3, '0')}`, qty_received: 411, receipt_date: '2026-11-15', created_at: '2026-11-17T09:00:00Z', ...extra })
const base = (extra = {}) => ({ settings: ON, stages: STAGES, dispatches: [dc('DC-008')], receipts: [rc(8, 'DC-008')], qcLogs: [], overrides: [], ...extra })
const block = (data, targetStageId = 5, sourceStageId = null) => qcBlockers({ targetStageId, sourceStageId }, data)

describe('qcGateSettings', () => {
  it('mode must be exactly "on"; missing / other = off', () => {
    expect(qcGateSettings([{ key: 'jobwork_qc_gate_mode', value: 'on' }]).on).toBe(true)
    expect(qcGateSettings([{ key: 'jobwork_qc_gate_mode', value: 'off' }]).on).toBe(false)
    expect(qcGateSettings([{ key: 'jobwork_qc_gate_mode', value: 'ON' }]).on).toBe(false)
    expect(qcGateSettings([]).on).toBe(false)
  })
  it('reads the Postgres now()::text start; unreadable -> null (every receipt checked)', () => {
    expect(qcGateSettings([{ key: 'jobwork_qc_gate_from', value: '2026-11-16 10:00:00.123456+00' }]).from).toBe(Date.parse('2026-11-16T10:00:00.123Z'))
    expect(qcGateSettings([{ key: 'jobwork_qc_gate_from', value: '2026-11-16 15:30:00+05:30' }]).from).toBe(Date.parse('2026-11-16T10:00:00Z'))
    expect(qcGateSettings([{ key: 'jobwork_qc_gate_from', value: 'soon' }]).from).toBeNull()
  })
})

describe('stage helpers', () => {
  it('position = distinct seqs up to the stage (055 label)', () => {
    expect(stagePositionOf(STAGES[4], STAGES)).toBe(5)
  })
  it('previous jobwork stages = Outsourced stages at the highest seq below the target', () => {
    expect(previousJobworkStages(STAGES[4], STAGES).map((s) => s.id)).toEqual([4])
    expect(previousJobworkStages(STAGES[5], STAGES)).toEqual([]) // previous is Internal
    expect(previousJobworkStages(STAGES[0], STAGES)).toEqual([]) // first stage
  })
})

describe('qcBlockers -- per receipt', () => {
  it('no inspection -> the exact message for the next stage', () => {
    expect(block(base()).map((b) => b.message)).toEqual([
      'PRD-012: Toughening (DC-008, JR-008) was received on 15-11-2026 but has no quality inspection yet. Ask Quality to inspect it before starting Stage 5.',
    ])
  })

  it('only the stage right after the jobwork stage is gated', () => {
    expect(block(base(), 6)).toEqual([]) // Grinding: previous stage is Internal
    expect(block(base(), 4)).toEqual([]) // the jobwork stage itself
  })

  it('nothing received yet -> nothing to inspect', () => {
    expect(block(base({ receipts: [] }))).toEqual([])
  })

  it('Accepted inspection of the receipt -> passes', () => {
    expect(block(base({ qcLogs: [{ id: 1, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'Accepted' }] }))).toEqual([])
  })

  it('an inspection with no readings does not count', () => {
    expect(block(base({ qcLogs: [{ id: 1, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'No readings' }] }))[0].state).toBe('pending')
  })

  it('Rejected -> blocks with the rejected message; a later Accepted clears it', () => {
    const rejected = [{ id: 1, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'Rejected' }]
    expect(block(base({ qcLogs: rejected })).map((b) => b.message)).toEqual([
      'PRD-012: Toughening (DC-008, JR-008) received on 15-11-2026 was Rejected at inspection on 16-11-2026. Ask Quality to re-inspect it, or a supervisor to override, before starting Stage 5.',
    ])
    expect(block(base({ qcLogs: [...rejected, { id: 2, receipt_id: 8, log_date: '2026-11-17', inspection_result: 'Accepted' }] }))).toEqual([])
  })

  it('the LATEST inspection decides (date, then id): Accepted then Rejected blocks', () => {
    const logs = [
      { id: 5, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'Accepted' },
      { id: 6, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'Rejected' },
    ]
    expect(latestInspection(8, logs).id).toBe(6)
    expect(block(base({ qcLogs: logs }))[0].state).toBe('rejected')
  })

  it('partial receipts (DC-003 134 of 138): each receipt needs its own inspection', () => {
    const data = base({
      dispatches: [dc('DC-003', { qty: 138 })],
      receipts: [rc(3, 'DC-003', { qty_received: 134 }), rc(13, 'DC-003', { qty_received: 4, receipt_date: '2026-11-18' })],
      qcLogs: [{ id: 1, receipt_id: 3, log_date: '2026-11-16', inspection_result: 'Accepted' }],
    })
    expect(block(data).map((b) => b.receipt_no)).toEqual(['JR-013'])
  })

  it('several DCs on the stage: every receipt of every DC', () => {
    const data = base({
      dispatches: [dc('DC-004', { qty: 353 }), dc('DC-006', { qty: 46 })],
      receipts: [rc(4, 'DC-004'), rc(6, 'DC-006')],
      qcLogs: [{ id: 1, receipt_id: 4, log_date: '2026-11-16', inspection_result: 'Accepted' }],
    })
    expect(block(data).map((b) => `${b.dc_no}/${b.receipt_no}`)).toEqual(['DC-006/JR-006'])
  })

  it('closed-short DC: only what came back is inspected (the short part has no receipt)', () => {
    const data = base({
      dispatches: [dc('DC-007', { qty: 46, closed_short_at: '2026-11-15' })],
      receipts: [rc(7, 'DC-007', { qty_received: 40 })],
      qcLogs: [{ id: 1, receipt_id: 7, log_date: '2026-11-16', inspection_result: 'Accepted' }],
    })
    expect(block(data)).toEqual([])
  })

  it('a voided DC is left out', () => {
    expect(block(base({ dispatches: [dc('DC-008', { voided_at: '2026-11-15' })] }))).toEqual([])
  })

  it('a supervisor override clears the receipt (even after a Rejected inspection)', () => {
    const data = base({
      qcLogs: [{ id: 1, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'Rejected' }],
      overrides: [{ id: 1, receipt_id: 8, reason: 'Accepted on deviation' }],
    })
    expect(receiptQcState({ id: 8 }, data)).toBe('overridden')
    expect(block(data)).toEqual([])
  })

  it('receipts created before jobwork_qc_gate_from are grandfathered', () => {
    const from = Date.parse('2026-11-16T10:00:00Z')
    const data = base({
      settings: { on: true, from },
      receipts: [rc(8, 'DC-008', { created_at: '2026-11-15T12:00:00Z' }), rc(9, 'DC-008', { created_at: '2026-11-16T10:00:00Z' })],
    })
    expect(block(data).map((b) => b.receipt_no)).toEqual(['JR-009']) // at the start time counts
  })

  it('gate off -> nothing blocks', () => {
    expect(block(base({ settings: { on: false, from: null } }))).toEqual([])
  })

  it('WIP Issue: a jobwork source stage further back is checked too', () => {
    // issue from Toughening's WIP straight into Grinding (seq 60; its previous stage is Internal)
    expect(block(base(), 6, 4).map((b) => b.receipt_no)).toEqual(['JR-008'])
    expect(block(base(), 6, 4)[0].message).toMatch(/before starting Stage 6\.$/)
    // source = the target's previous stage: counted once
    expect(block(base(), 5, 4)).toHaveLength(1)
    // internal source: nothing extra
    expect(block(base(), 6, 3)).toEqual([])
  })
})

describe('pending list + bell', () => {
  const data = base({
    dispatches: [dc('DC-008'), dc('DC-009', { stage_id: 4 })],
    receipts: [rc(8, 'DC-008'), rc(9, 'DC-009', { receipt_date: '2026-11-14' })],
    qcLogs: [{ id: 1, receipt_id: 9, log_date: '2026-11-16', inspection_result: 'Rejected' }],
  })

  it('every receipt waiting for QC, oldest first, with status', () => {
    const items = pendingIncomingQc(data)
    expect(items.map((i) => [i.receipt_no, i.state])).toEqual([['JR-009', 'rejected'], ['JR-008', 'pending']])
    expect(pendingQcText(items[1])).toBe('PRD-012 · Toughening · DC-008 / JR-008 · 411 pcs received 15-11-2026 -- no inspection yet')
    expect(pendingQcText(items[0])).toMatch(/-- Rejected on 16-11-2026$/)
  })

  it('bell items open Quality Inspection on that receipt', () => {
    expect(pendingIncomingQcItems(data)[1]).toEqual({
      id: 'qc:8',
      text: 'PRD-012 · Toughening · DC-008 / JR-008 · 411 pcs received 15-11-2026 -- no inspection yet',
      open: { topKey: 'quality', subKey: 'inspection', mode: 'qc:8' },
    })
    expect(pendingIncomingQc({ ...data, settings: { on: false } })).toEqual([])
  })

  it('open mode round trip', () => {
    expect(receiptFromMode(qcMode(12))).toBe(12)
    expect(receiptFromMode('dc:DC-004')).toBeNull()
    expect(receiptFromMode(undefined)).toBeNull()
  })
})

describe('qualityMachineText (readers of quality logs.machine_id)', () => {
  it('machine log -> the machine; receipt log (no machine, 054) -> "Jobwork"', () => {
    expect(qualityMachineText({ machine_id: 'MC-004' })).toBe('MC-004')
    expect(qualityMachineText({ machine_id: 'MC-004', machine_name: 'CNC 1' }, (r) => `${r.machine_name} (${r.machine_id})`)).toBe('CNC 1 (MC-004)')
    expect(qualityMachineText({ machine_id: null, receipt_id: 8 })).toBe('Jobwork')
    expect(qualityMachineText(null)).toBe('')
  })
})
