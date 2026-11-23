import { describe, it, expect } from 'vitest'
import {
  buildCycleTimePayload, withType, rowProblem, isBlankRow, capabilityProblem, bulkProblems, bulkPayloads, rowFromDbError, EMPTY_STAGE_ROW,
} from './cycleTimeBulk'

const row = (over) => ({ ...EMPTY_STAGE_ROW, ...over })
const INT = (seq, op, mc, extra) => row({ seq: String(seq), operation: op, type: 'Internal', machine_id: mc, ...extra })
const OPS = [
  { machine_id: 'MC-4', operation: 'Rough  Turning' },
  { machine_id: 'MC-4', operation: 'Facing' },
  { machine_id: 'MC-5', operation: 'Rough Turning' },
]

describe('payload + type change', () => {
  it('buildCycleTimePayload nulls the target that does not apply', () => {
    expect(buildCycleTimePayload('P1', row({ seq: '2', operation: ' Cut ', type: 'Outsourced', machine_id: 'MC-4', job_work_code: 'HT', cycle_time_min: '' })))
      .toEqual({ part_serial_number: 'P1', operation: 'Cut', seq: 2, type: 'Outsourced', machine_id: null, job_work_code: 'HT', cycle_time_min: null })
  })
  it('withType clears the field that no longer applies', () => {
    expect(withType(row({ machine_id: 'MC-4', job_work_code: 'HT' }), 'Internal')).toMatchObject({ machine_id: 'MC-4', job_work_code: '' })
    expect(withType(row({ machine_id: 'MC-4', job_work_code: 'HT' }), 'Outsourced')).toMatchObject({ machine_id: '', job_work_code: 'HT' })
    expect(withType(row({ machine_id: 'MC-4', job_work_code: 'HT' }), 'Manual')).toMatchObject({ machine_id: '', job_work_code: '' })
  })
})

describe('row rules (single form rules)', () => {
  it('required, stage 1-999 whole, cycle time > 0, Internal machine, Outsourced job work', () => {
    expect(rowProblem(row({ operation: 'Cut', type: 'Manual' }))).toEqual({ message: 'Operation, Stage and Type are required.', field: 'seq' })
    expect(rowProblem(row({ seq: '1', type: 'Manual' })).field).toBe('operation')
    expect(rowProblem(row({ seq: '1', operation: 'Cut' })).field).toBe('type')
    expect(rowProblem(row({ seq: '1.5', operation: 'Cut', type: 'Manual' })).field).toBe('seq')
    expect(rowProblem(row({ seq: '1000', operation: 'Cut', type: 'Manual' })).field).toBe('seq')
    expect(rowProblem(row({ seq: '0', operation: 'Cut', type: 'Manual' })).field).toBe('seq')
    expect(rowProblem(row({ seq: '1', operation: 'Cut', type: 'Manual', cycle_time_min: '0' })).field).toBe('cycle_time_min')
    expect(rowProblem(row({ seq: '1', operation: 'Cut', type: 'Internal' }))).toEqual({ message: 'Machine is required for an Internal step.', field: 'machine_id' })
    expect(rowProblem(row({ seq: '1', operation: 'Cut', type: 'Outsourced' }))).toEqual({ message: 'Job Work Type is required for an Outsourced step.', field: 'job_work_code' })
    expect(rowProblem(row({ seq: '1', operation: 'Cut', type: 'Manual' }))).toBeNull()
  })
  it('blank row: nothing typed', () => {
    expect(isBlankRow(row())).toBe(true)
    expect(isBlankRow(row({ seq: '  ' }))).toBe(true)
    expect(isBlankRow(row({ type: 'Manual' }))).toBe(false)
  })
})

describe('machine capability (Machine Operations)', () => {
  it('blocks when the machine has operations and this one is not among them (spaces / case ignored)', () => {
    expect(capabilityProblem(INT(1, 'rough turning', 'MC-4'), OPS)).toBeNull()
    expect(capabilityProblem(INT(1, 'Grinding', 'MC-4'), OPS)).toBe("MC-4 is not set up for 'Grinding' in Machine Master (Machine Operations).")
  })
  it('machines with no operations are not checked; non-Internal never', () => {
    expect(capabilityProblem(INT(1, 'Grinding', 'MC-9'), OPS)).toBeNull()
    expect(capabilityProblem(row({ seq: '1', operation: 'Grinding', type: 'Manual' }), OPS)).toBeNull()
  })
})

describe('bulkProblems', () => {
  it('part required; all blank -> empty', () => {
    expect(bulkProblems('', [INT(1, 'Facing', 'MC-4')], [], OPS).header).toBe('Select the Part Serial Number.')
    expect(bulkProblems('P1', [row(), row()], [], OPS)).toMatchObject({ empty: true, count: 0 })
  })

  it('blank rows ignored; errors keep their grid index', () => {
    const r = bulkProblems('P1', [INT(1, 'Facing', 'MC-4'), row(), row({ seq: '2', operation: 'X', type: 'Internal' })], [], OPS)
    expect(r.count).toBe(2)
    expect(Object.keys(r.rows)).toEqual(['2'])
  })

  it('duplicate = stage + target: same machine refused, alternative machines allowed', () => {
    const r = bulkProblems('P1', [
      INT(2, 'Rough Turning', 'MC-4'), INT(2, 'Rough Turning', 'MC-5'), // alternatives: OK
      INT(3, 'Facing', 'MC-4'), INT(3, 'Facing', 'MC-4'), // same stage + machine twice
    ], [], OPS)
    expect(r.rows[0]).toBeUndefined()
    expect(r.rows[1]).toBeUndefined()
    expect(r.rows[2].message).toBe('Stage 3 on MC-4 is entered more than once in this grid.')
    expect(r.rows[3].message).toBe('Stage 3 on MC-4 is entered more than once in this grid.')
  })

  it('duplicates for Outsourced (job work) and Manual (stage alone)', () => {
    const r = bulkProblems('P1', [
      row({ seq: '4', operation: 'HT', type: 'Outsourced', job_work_code: 'HT' }),
      row({ seq: '4', operation: 'HT', type: 'Outsourced', job_work_code: 'BR' }),
      row({ seq: '5', operation: 'Deburr', type: 'Manual' }),
      row({ seq: '05', operation: 'Wash', type: 'Manual' }),
    ], [], OPS)
    expect(r.rows[0]).toBeUndefined()
    expect(r.rows[1]).toBeUndefined()
    expect(r.rows[2].message).toBe('Stage 5 (Manual) is entered more than once in this grid.')
    expect(r.rows[3].message).toBe('Stage 5 (Manual) is entered more than once in this grid.')
  })

  it('against saved rows of the SAME part only', () => {
    const existing = [
      { part_serial_number: 'P1', seq: 2, type: 'Internal', machine_id: 'MC-4' },
      { part_serial_number: 'P2', seq: 3, type: 'Internal', machine_id: 'MC-4' },
    ]
    const r = bulkProblems('P1', [INT(2, 'Rough Turning', 'MC-4'), INT(3, 'Facing', 'MC-4'), INT(2, 'Rough Turning', 'MC-5')], existing, OPS)
    expect(r.rows[0].message).toBe('Stage 2 on MC-4 already exists for P1 -- edit it instead.')
    expect(r.rows[1]).toBeUndefined()
    expect(r.rows[2]).toBeUndefined()
  })

  it('capability error shown on the machine field', () => {
    expect(bulkProblems('P1', [INT(1, 'Grinding', 'MC-4')], [], OPS).rows[0]).toEqual({
      message: "MC-4 is not set up for 'Grinding' in Machine Master (Machine Operations).", field: 'machine_id',
    })
  })

  it('bulkPayloads skips blank rows', () => {
    expect(bulkPayloads('P1', [row(), INT(1, 'Facing', 'MC-4')]).map((p) => p.operation)).toEqual(['Facing'])
  })
})

describe('rowFromDbError', () => {
  const rows = [INT(1, 'Facing', 'MC-4'), row(), INT(2, 'Rough Turning', 'MC-5'), row({ seq: '3', operation: 'Deburr', type: 'Manual' })]
  it('one row named (operation word or Stage N) -> its index', () => {
    expect(rowFromDbError({ message: 'violates check constraint', details: 'Failing row contains (P1, Rough Turning, 2, ...)' }, rows)).toBe(2)
    expect(rowFromDbError({ message: 'Stage 3 refused' }, rows)).toBe(3)
  })
  it('none or several -> null (never guessed)', () => {
    expect(rowFromDbError({ message: 'permission denied for table cycle time master' }, rows)).toBeNull()
    expect(rowFromDbError({ message: 'Facing and Deburr' }, rows)).toBeNull()
    expect(rowFromDbError({ message: 'Surfacing' }, rows)).toBeNull()
  })
})
