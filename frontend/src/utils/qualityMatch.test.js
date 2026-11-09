import { describe, it, expect } from 'vitest'
import {
  qualityParamsForStage, noParamsMessage, operationsForTarget, categoryOptions,
  appliesToLabel, parameterNamesForMachine, isCategoryRow,
} from './qualityMatch'

const machines = [
  { machine_id: 'MC-004', category: 'CNC' },
  { machine_id: 'MC-005', category: ' cnc ' }, // same category, other spelling
  { machine_id: 'MC-007', category: 'VMC' },
  { machine_id: 'MC-010', category: 'Grinding' },
  { machine_id: 'MC-011', category: '' },
]

const row = (id, extra) => ({ id, part_serial_number: 'P1', type_of_operation: 'Rough Turning', machine_id: null, machine_category: null, ...extra })

describe('qualityParamsForStage -- matching order', () => {
  const base = { partSerialNumber: 'P1', operation: 'Rough Turning', machines }

  it('exact machine and its category are combined (cumulative)', () => {
    const params = [
      row(1, { machine_id: 'MC-004', quality_parameter: 'OD' }),
      row(2, { machine_category: 'CNC', quality_parameter: 'Length' }),
      row(3, { machine_category: 'VMC', quality_parameter: 'Flatness' }),
    ]
    const r = qualityParamsForStage({ ...base, params, chosenId: 'MC-004', plannedId: 'MC-004' })
    expect(r.params.map((p) => p.id)).toEqual([1, 2])
    expect(r.source).toBe('chosen')
    expect(r.note).toBe('')
  })

  it('category only: a machine with no own rows gets its category rows (trimmed, case-insensitive)', () => {
    const params = [row(2, { machine_category: 'CNC', quality_parameter: 'Length' })]
    const r = qualityParamsForStage({ ...base, params, chosenId: 'MC-005', plannedId: 'MC-005' })
    expect(r.params.map((p) => p.id)).toEqual([2])
  })

  it('same parameter name: the exact machine wins over the category', () => {
    const params = [
      row(2, { machine_category: 'CNC', quality_parameter: 'OD', standard: 50 }),
      row(1, { machine_id: 'MC-004', quality_parameter: ' od ', standard: 49.9 }),
      row(3, { machine_category: 'CNC', quality_parameter: 'Length' }),
    ]
    const r = qualityParamsForStage({ ...base, params, chosenId: 'MC-004' })
    expect(r.params.map((p) => p.id)).toEqual([1, 3])
  })

  it('within a level an exact-operation row beats a blank-operation row', () => {
    const params = [
      row(1, { machine_id: 'MC-004', type_of_operation: null, quality_parameter: 'OD' }),
      row(2, { machine_id: 'MC-004', quality_parameter: 'OD' }),
    ]
    expect(qualityParamsForStage({ ...base, params, chosenId: 'MC-004' }).params.map((p) => p.id)).toEqual([2])
  })

  it('a blank operation means any operation (machine and category rows)', () => {
    const params = [
      row(1, { machine_id: 'MC-004', type_of_operation: '', quality_parameter: 'OD' }),
      row(2, { machine_category: 'CNC', type_of_operation: null, quality_parameter: 'Length' }),
      row(3, { machine_id: 'MC-004', type_of_operation: 'Facing', quality_parameter: 'Face' }),
    ]
    expect(qualityParamsForStage({ ...base, params, chosenId: 'MC-004' }).params.map((p) => p.id)).toEqual([1, 2])
  })

  it('substitute: nothing for the chosen machine or its category -> planned machine + its category, with the note', () => {
    const params = [
      row(1, { machine_id: 'MC-004', quality_parameter: 'OD' }),
      row(2, { machine_category: 'CNC', quality_parameter: 'Length' }),
    ]
    const r = qualityParamsForStage({ ...base, params, chosenId: 'MC-007', plannedId: 'MC-004' })
    expect(r.params.map((p) => p.id)).toEqual([1, 2])
    expect(r.source).toBe('planned')
    expect(r.note).toBe('parameters from planned machine MC-004')
  })

  it('the planned machine is not used when the chosen machine has category rows', () => {
    const params = [
      row(1, { machine_id: 'MC-004', quality_parameter: 'OD' }),
      row(2, { machine_category: 'VMC', quality_parameter: 'Flatness' }),
    ]
    const r = qualityParamsForStage({ ...base, params, chosenId: 'MC-007', plannedId: 'MC-004' })
    expect(r.params.map((p) => p.id)).toEqual([2])
    expect(r.note).toBe('')
  })

  it('other part / other operation / blank-category machine -> nothing', () => {
    const params = [
      row(1, { part_serial_number: 'P2', machine_id: 'MC-011', quality_parameter: 'OD' }),
      row(2, { machine_id: 'MC-011', type_of_operation: 'Facing', quality_parameter: 'Face' }),
      row(3, { machine_category: 'CNC', quality_parameter: 'Length' }),
    ]
    const r = qualityParamsForStage({ ...base, params, chosenId: 'MC-011', plannedId: 'MC-011' })
    expect(r).toEqual({ params: [], note: '', source: null })
  })

  it('pre-044 rows (machine only, no machine_category column) behave as before', () => {
    const params = [
      { id: 1, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'OD' },
      { id: 2, part_serial_number: 'P1', machine_id: 'MC-005', type_of_operation: 'Rough Turning', quality_parameter: 'OD' },
    ]
    expect(qualityParamsForStage({ ...base, params, chosenId: 'MC-005', plannedId: 'MC-004' }).params.map((p) => p.id)).toEqual([2])
  })
})

describe('messages and labels', () => {
  it('empty message names part, operation, machine and category', () => {
    expect(noParamsMessage({ partSerialNumber: 'P1', operation: 'Rough Turning', machineId: 'MC-004', category: 'CNC' }))
      .toBe('No quality parameters are defined for P1 - Rough Turning (MC-004 / CNC). Add them in Quality Master before an inspection can be logged here.')
    expect(noParamsMessage({ partSerialNumber: 'P1', operation: 'Facing', machineId: 'MC-011', category: '' })).toContain('(MC-011)')
  })

  it('appliesToLabel: "CNC (all)" or the machine label', () => {
    expect(appliesToLabel({ machine_id: null, machine_category: ' CNC ' })).toBe('CNC (all)')
    expect(appliesToLabel({ machine_id: 'MC-004' }, (id) => `CNC 1 (${id})`)).toBe('CNC 1 (MC-004)')
    expect(isCategoryRow({ machine_id: null, machine_category: '  ' })).toBe(false)
  })

  it('categoryOptions: distinct, trimmed, blanks dropped, sorted', () => {
    expect(categoryOptions(machines)).toEqual(['CNC', 'Grinding', 'VMC'])
  })
})

describe('operationsForTarget (Quality Master form options)', () => {
  const cycleTimes = [
    { part_serial_number: 'P1', machine_id: 'MC-004', operation: 'Rough Turning' },
    { part_serial_number: 'P1', machine_id: 'MC-005', operation: 'Finish Turning' },
    { part_serial_number: 'P1', machine_id: 'MC-007', operation: 'Drilling' },
    { part_serial_number: 'P2', machine_id: 'MC-004', operation: 'Other Part Op' },
  ]
  it('category: operations of the part on every machine of that category', () => {
    expect(operationsForTarget({ cycleTimes, machines, partSerialNumber: 'P1', category: 'cnc' })).toEqual(['Rough Turning', 'Finish Turning'])
  })
  it('machine: operations of the part on that machine only', () => {
    expect(operationsForTarget({ cycleTimes, machines, partSerialNumber: 'P1', machineId: 'MC-005' })).toEqual(['Finish Turning'])
  })
  it('nothing picked -> no options', () => {
    expect(operationsForTarget({ cycleTimes, machines, partSerialNumber: 'P1' })).toEqual([])
    expect(operationsForTarget({ cycleTimes, machines, partSerialNumber: '', category: 'CNC' })).toEqual([])
  })
})

describe('parameterNamesForMachine (Quality Status filter)', () => {
  it('machine rows + rows of its category', () => {
    const params = [
      row(1, { machine_id: 'MC-004', quality_parameter: 'OD' }),
      row(2, { machine_category: 'CNC', quality_parameter: 'Length' }),
      row(3, { machine_category: 'VMC', quality_parameter: 'Flatness' }),
      row(4, { machine_id: 'MC-005', quality_parameter: 'Bore' }),
    ]
    expect(parameterNamesForMachine(params, machines, 'MC-004')).toEqual(['OD', 'Length'])
    expect(parameterNamesForMachine(params, machines, 'MC-011')).toEqual([])
  })
})
