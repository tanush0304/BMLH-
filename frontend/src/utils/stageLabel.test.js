import { describe, expect, it } from 'vitest'
import { stageNumber, withStagePositions, stageLabel, stageDisplayNumber, positionBySeq, withRoutePositions } from './stageLabel'
import { noAvailableMessage } from './stageStartGuard'
import { filterOptions } from './searchableSelect'
import { openLogsWithSeq, machinesForStage } from './machineEligibility'

const route = [
  { id: 3, prd_no: 'P1', seq: 30, operation: 'Slotting' },
  { id: 1, prd_no: 'P1', seq: 10, operation: 'Cutting' },
  { id: 2, prd_no: 'P1', seq: 25, operation: 'Turning' }, // gap 10 -> 25 -> 30
]

describe('stageNumber / withStagePositions (display position, stored seq unchanged)', () => {
  it('position in seq order with gaps and unsorted input', () => {
    expect(stageNumber(route[0], route)).toBe(3)
    expect(stageNumber(route[1], route)).toBe(1)
    expect(stageNumber(route[2], route)).toBe(2)
  })
  it('single stage = 1; unknown stage = null', () => {
    expect(stageNumber({ id: 9, prd_no: 'P2', seq: 50 }, [{ id: 9, prd_no: 'P2', seq: 50 }])).toBe(1)
    expect(stageNumber({ id: 99, prd_no: 'P1', seq: 99 }, route)).toBeNull()
  })
  it('positions per PRD, input order and seq kept', () => {
    const out = withStagePositions([...route, { id: 7, prd_no: 'P2', seq: 20 }, { id: 6, prd_no: 'P2', seq: 10 }])
    expect(out.map((s) => [s.id, s.seq, s.position])).toEqual([[3, 30, 3], [1, 10, 1], [2, 25, 2], [7, 20, 2], [6, 10, 1]])
  })
})

describe('labels use the position', () => {
  it('stageLabel: position when known, seq as fallback', () => {
    expect(stageLabel({ seq: 30, position: 3, operation: 'Slotting' })).toBe('Stage 3 – Slotting')
    expect(stageLabel({ seq: 30, operation: 'Slotting' })).toBe('Stage 30 – Slotting')
    expect(stageLabel({ seq: 30, position: 3 })).toBe('Stage 3')
    expect(stageDisplayNumber({ seq: 70, position: 7 })).toBe(7)
  })
  it('start-guard message and busy label use the position', () => {
    expect(noAvailableMessage({ seq: 30, position: 3 })).toMatch(/^Nothing available for Stage 3 yet/)
    const stages = withStagePositions(route)
    expect(openLogsWithSeq([{ machine_id: 'MC-1', stage_id: 3, prd_no: 'P1' }], stages)[0].stage_seq).toBe(3)
  })
})

// Restored from the original file (no position -> seq fallback).
describe('stageLabel', () => {
  it('shows sequence and operation', () => {
    expect(stageLabel({ id: 91, seq: 4, operation: 'Toughening' })).toBe('Stage 4 – Toughening')
    expect(stageLabel({ id: 91, seq: 4, operation: null })).toBe('Stage 4')
  })
  it('is searchable by number and by operation', () => {
    const opts = [{ value: '91', label: stageLabel({ seq: 4, operation: 'Toughening' }) }, { value: '92', label: stageLabel({ seq: 5, operation: 'Plating' }) }]
    expect(filterOptions(opts, '4').map((o) => o.value)).toEqual(['91'])
    expect(filterOptions(opts, 'plat').map((o) => o.value)).toEqual(['92'])
  })
})

describe('positionBySeq (Masters > Route Card template)', () => {
  it('numbers distinct seqs; rows sharing a seq (one per machine) share the stage number', () => {
    const m = positionBySeq([{ seq: 20, machine_id: 'MC-005' }, { seq: 10 }, { seq: 20, machine_id: 'MC-004' }, { seq: 35 }])
    expect([m.get(10), m.get(20), m.get(35)]).toEqual([1, 2, 3])
    expect(positionBySeq([]).size).toBe(0)
  })
  // The Route Card screen itself (Stage only, no Seq): modules/masters/stageColumns.test.jsx
})

describe('withRoutePositions (template rows: Cycle Time Master, Route Card)', () => {
  it('numbers each part by its distinct seqs; a shared seq shares a number; seq and order kept', () => {
    const rows = [
      { id: 1, part_serial_number: 'A', seq: 30 },
      { id: 2, part_serial_number: 'B', seq: 5 },
      { id: 3, part_serial_number: 'A', seq: 10 },
      { id: 4, part_serial_number: 'A', seq: 30 }, // second machine, same seq
      { id: 5, part_serial_number: 'B', seq: 40 },
    ]
    const out = withRoutePositions(rows)
    expect(out.map((r) => [r.id, r.seq, r.stage_no])).toEqual([[1, 30, 2], [2, 5, 1], [3, 10, 1], [4, 30, 2], [5, 40, 2]])
    expect(rows[0].stage_no).toBeUndefined() // input untouched
  })
  it('empty input -> empty', () => {
    expect(withRoutePositions()).toEqual([])
  })
})

describe('busy label (machinesForStage + openLogsWithSeq)', () => {
  const stage = { id: 9, prd_no: 'P2', seq: 10, operation: 'Turning', machine_id: 'MC-1', type: 'Internal' }
  const opts = (stages) => machinesForStage({
    mode: 'any', stage, machineOps: [], machines: [{ machine_id: 'MC-1' }], cycleTimeRows: [],
    openLogs: openLogsWithSeq([{ machine_id: 'MC-1', stage_id: 3, prd_no: 'P1' }], stages),
  })
  it('shows the position of the busy stage, not its seq', () => {
    expect(opts(withStagePositions(route))[0].label).toMatch(/— busy: P1 Stage 3$/)
  })
  it('unknown stage -> PRD only, no number', () => {
    expect(opts([])[0].label).toMatch(/— busy: P1$/)
  })
})
