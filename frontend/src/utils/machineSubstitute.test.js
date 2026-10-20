import { describe, expect, it } from 'vitest'
import {
  machinesForStage, substituteReasonRequired, validateSubstituteReason, cycleTimeForMachine,
  qualityParamsForMachine, actualVsPlanned, substituteLine,
} from './machineEligibility'
import { MACHINE_CHOICE_MODE, SUBSTITUTE_REASONS } from './constants'

const machines = [
  { machine_id: 'MC-004', machine_name: 'CNC 1', category: 'CNC Turning' },
  { machine_id: 'MC-005', machine_name: 'CNC 2', category: 'CNC Turning' },
  { machine_id: 'MC-006', machine_name: 'CNC 3', category: 'CNC Turning' },
  { machine_id: 'MC-009', machine_name: 'TURNMILL', category: 'CNC Turning' },
  { machine_id: 'MC-010', machine_name: 'VMC1', category: 'VMC' },
  { machine_id: 'MC-021', machine_name: 'Surface Grinding 2', category: 'Grinding' },
]
const machineOps = [
  { machine_id: 'MC-004', operation: 'Rough Turning' },
  { machine_id: 'MC-005', operation: 'rough  turning ' },
  { machine_id: 'MC-006', operation: 'Finish Turning' },
  { machine_id: 'MC-010', operation: 'Slotting' },
]
const stage = { seq: 20, operation: 'Rough Turning', machine_id: 'MC-004' }
const cycleTimeRows = [{ machine_id: 'MC-004', seq: 20, cycle_time_min: 4 }, { machine_id: 'MC-021', seq: 20, cycle_time_min: 5 }]
const ids = (opts) => machinesForStage({ stage, machines, machineOps, cycleTimeRows, ...opts }).map((m) => m.machine_id)

describe('machinesForStage', () => {
  it("defaults to 'capable'", () => expect(MACHINE_CHOICE_MODE).toBe('capable'))
  it("'capable': planned first + operation matches (case/space-insensitive) + Cycle Time machines (union)", () => {
    expect(ids({ mode: 'capable' })).toEqual(['MC-004', 'MC-005', 'MC-021'])
  })
  it("'capable' falls back to the planned machine's category when no operation matches", () => {
    const s = { seq: 30, operation: 'Rough Turning ONE', machine_id: 'MC-006' }
    expect(machinesForStage({ mode: 'capable', stage: s, machines, machineOps, cycleTimeRows: [] }).map((m) => m.machine_id))
      .toEqual(['MC-006', 'MC-004', 'MC-005', 'MC-009'])
  })
  it("'category': planned + its category + Cycle Time machines", () => {
    expect(ids({ mode: 'category' })).toEqual(['MC-004', 'MC-005', 'MC-006', 'MC-009', 'MC-021'])
  })
  it("'any': planned + every machine", () => {
    expect(ids({ mode: 'any' })).toEqual(['MC-004', 'MC-005', 'MC-006', 'MC-009', 'MC-010', 'MC-021'])
  })
  it('planned is first and labelled; busy machines labelled from open logs', () => {
    const list = machinesForStage({ mode: 'capable', stage, machines, machineOps, cycleTimeRows,
      openLogs: [{ machine_id: 'MC-005', prd_no: 'PRD-006', stage_seq: 50 }] })
    expect(list[0]).toMatchObject({ machine_id: 'MC-004', planned: true, label: 'CNC 1 (MC-004) (planned)' })
    expect(list.find((m) => m.machine_id === 'MC-005').label).toBe('CNC 2 (MC-005) — busy: PRD-006 Stage 50')
  })
  it('no stage -> no options', () => expect(machinesForStage({ stage: null })).toEqual([]))
})

describe('substitute reason', () => {
  it('required only when the chosen machine is not the planned one', () => {
    expect(substituteReasonRequired('MC-005', 'MC-004')).toBe(true)
    expect(substituteReasonRequired('MC-004', 'MC-004')).toBe(false)
    expect(substituteReasonRequired('MC-005', null)).toBe(false)
  })
  it('validation mirrors 040 (reason; Other needs text)', () => {
    expect(SUBSTITUTE_REASONS).toEqual(['Planned machine busy', 'Breakdown', 'Supervisor instruction', 'Other'])
    expect(validateSubstituteReason({ chosenId: 'MC-005', plannedId: 'MC-004' })).toMatch(/choose a substitute reason/)
    expect(validateSubstituteReason({ chosenId: 'MC-005', plannedId: 'MC-004', reason: 'Other', note: ' ' })).toMatch(/reason text/)
    expect(validateSubstituteReason({ chosenId: 'MC-005', plannedId: 'MC-004', reason: 'Breakdown' })).toBeNull()
    expect(validateSubstituteReason({ chosenId: 'MC-004', plannedId: 'MC-004' })).toBeNull()
  })
})

describe('cycle time + quality fallbacks', () => {
  it("own Cycle Time row wins; else the stage's frozen time with a note", () => {
    expect(cycleTimeForMachine({ cycleTimeRows, seq: 20, chosenId: 'MC-004', plannedId: 'MC-004', frozenCycleTime: 4 })).toEqual({ cycleTimeMin: 4, note: '' })
    expect(cycleTimeForMachine({ cycleTimeRows, seq: 20, chosenId: 'MC-005', plannedId: 'MC-004', frozenCycleTime: 4 }))
      .toEqual({ cycleTimeMin: 4, note: 'Cycle time 4 min (from planned machine MC-004 — no entry for MC-005)' })
  })
  it("quality parameters: chosen machine's, else the planned machine's with a note", () => {
    const params = [
      { id: 1, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'OD' },
      { id: 2, part_serial_number: 'P1', machine_id: 'MC-006', type_of_operation: 'Rough Turning', quality_parameter: 'OD' },
    ]
    expect(qualityParamsForMachine({ params, partSerialNumber: 'P1', operation: 'Rough Turning', chosenId: 'MC-006', plannedId: 'MC-004' }))
      .toEqual({ params: [params[1]], note: '' })
    expect(qualityParamsForMachine({ params, partSerialNumber: 'P1', operation: 'Rough Turning', chosenId: 'MC-005', plannedId: 'MC-004' }))
      .toEqual({ params: [params[0]], note: 'parameters from planned machine MC-004' })
  })
})

describe('display strings', () => {
  it('actual vs planned only when they differ', () => {
    expect(actualVsPlanned('MC-005', 'MC-004')).toBe('MC-005 (planned MC-004)')
    expect(actualVsPlanned('MC-004', 'MC-004')).toBe('MC-004')
    expect(actualVsPlanned('MC-004', null)).toBe('MC-004')
  })
  it('Shift Verification substitute line', () => {
    expect(substituteLine({ actualId: 'MC-005', plannedId: 'MC-004', actualLabel: 'CNC 2 (MC-005)', plannedLabel: 'CNC 1 (MC-004)', reason: 'Breakdown' }))
      .toBe('Substitute machine: CNC 2 (MC-005) (planned CNC 1 (MC-004)), reason: Breakdown')
    expect(substituteLine({ actualId: 'MC-005', plannedId: 'MC-004', reason: 'Other', note: 'Chuck change' }))
      .toBe('Substitute machine: MC-005 (planned MC-004), reason: Other – Chuck change')
    expect(substituteLine({ actualId: 'MC-004', plannedId: 'MC-004' })).toBe('')
  })
})
