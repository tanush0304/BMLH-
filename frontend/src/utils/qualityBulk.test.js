import { describe, it, expect } from 'vitest'
import {
  buildPayload, rowProblem, rowFromDbError, isBlankRow, bulkProblems, bulkPayloads, sourceRecords, copyRows, EMPTY_BULK_ROW,
} from './qualityBulk'

const ALL = { categoryOn: true, jobWorkOn: true, checkTypeOn: true, gaugeStandardOn: true }
const CAT = { part_serial_number: 'P1', applies_to: 'category', machine_id: '', machine_category: ' CNC ', job_work_code: '', type_of_operation: 'Rough Turning' }
const JW = { ...CAT, applies_to: 'jobwork', machine_category: '', job_work_code: 'HT', type_of_operation: 'Toughening' }
const row = (over) => ({ ...EMPTY_BULK_ROW, ...over })

describe('buildPayload', () => {
  it('Measured category row', () => {
    expect(buildPayload(CAT, row({ quality_parameter: ' OD ', standard: '50', upper_tolerance: '0.1', gauge_ref: ' Mic ' }), ALL)).toEqual({
      part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', job_work_code: null, type_of_operation: 'Rough Turning',
      quality_parameter: 'OD', standard: 50, upper_tolerance: 0.1, lower_tolerance: null,
      check_type: 'Measured', gauge_ref: 'Mic', gauge_standard: null, expected_text_value: null, remarks: null,
    })
  })

  it('Job Work is always Gauge, numbers null, even if the row says Measured', () => {
    const p = buildPayload(JW, row({ quality_parameter: 'Hardness', check_type: 'Measured', standard: '5', gauge_standard: ' 58-62 HRC ' }), ALL)
    expect(p).toMatchObject({ job_work_code: 'HT', machine_id: null, machine_category: null, check_type: 'Gauge', standard: null, gauge_standard: '58-62 HRC' })
  })

  it('before 044/048/053/054: none of their columns sent', () => {
    const p = buildPayload({ ...CAT, applies_to: 'machine', machine_id: 'MC-004' }, row({ quality_parameter: 'OD', standard: '1' }), {})
    expect(p.machine_id).toBe('MC-004')
    for (const k of ['machine_category', 'job_work_code', 'check_type', 'gauge_ref', 'gauge_standard']) expect(p).not.toHaveProperty(k)
  })
})

describe('row rules', () => {
  it('parameter required; Measured needs a numeric Standard; tolerances >= 0', () => {
    expect(rowProblem(row({ standard: '1' }), false).field).toBe('quality_parameter')
    expect(rowProblem(row({ quality_parameter: 'OD' }), false)).toEqual({ message: 'Standard is required.', field: 'standard' })
    expect(rowProblem(row({ quality_parameter: 'OD', standard: 'abc' }), false).field).toBe('standard')
    expect(rowProblem(row({ quality_parameter: 'OD', standard: '5', upper_tolerance: '-1' }), false).field).toBe('upper_tolerance')
    expect(rowProblem(row({ quality_parameter: 'OD', standard: '5', lower_tolerance: '-0.1' }), false).field).toBe('lower_tolerance')
    expect(rowProblem(row({ quality_parameter: 'OD', standard: '5', upper_tolerance: '0', lower_tolerance: '0.2' }), false)).toBeNull()
    expect(rowProblem(row({ quality_parameter: 'Thread' }), true)).toBeNull() // Gauge: no Standard needed
  })

  it('blank row = nothing typed; Check Type alone does not count', () => {
    expect(isBlankRow(row({ check_type: 'Gauge' }))).toBe(true)
    expect(isBlankRow(row({ remarks: ' x ' }))).toBe(false)
    expect(isBlankRow(row({ standard: '  ' }))).toBe(true)
  })
})

describe('bulkProblems', () => {
  it('all blank -> empty', () => {
    expect(bulkProblems(CAT, [row(), row()], [], ALL)).toMatchObject({ empty: true, count: 0, header: null })
  })

  it('header missing', () => {
    expect(bulkProblems({ ...CAT, type_of_operation: '' }, [row({ quality_parameter: 'OD', standard: '1' })], [], ALL).header)
      .toBe('Part Serial Number, Machine Category and Type of Operation are required.')
  })

  it('blank rows ignored; per-row errors keep their grid index', () => {
    const rows = [row({ quality_parameter: 'OD', standard: '1' }), row(), row({ quality_parameter: 'ID' })]
    const r = bulkProblems(CAT, rows, [], ALL)
    expect(r.count).toBe(2)
    expect(Object.keys(r.rows)).toEqual(['2'])
    expect(r.rows[2].message).toBe('Standard is required.')
  })

  it('duplicate names in the grid (case / spaces ignored) flag both rows', () => {
    const r = bulkProblems(CAT, [row({ quality_parameter: 'OD', standard: '1' }), row({ quality_parameter: ' od ', standard: '2' })], [], ALL)
    expect(r.rows[0].message).toBe('OD is entered more than once in this grid.')
    expect(r.rows[1].message).toBe('od is entered more than once in this grid.')
  })

  it('duplicate against the master for the same part + operation + target only', () => {
    const records = [
      { id: 1, part_serial_number: 'P1', machine_category: 'cnc', type_of_operation: 'Rough Turning', quality_parameter: 'OD' },
      { id: 2, part_serial_number: 'P1', machine_category: 'VMC', type_of_operation: 'Rough Turning', quality_parameter: 'Length' },
    ]
    const r = bulkProblems(CAT, [row({ quality_parameter: 'od', standard: '1' }), row({ quality_parameter: 'Length', standard: '2' })], records, ALL)
    expect(r.rows[0].message).toBe('OD is already defined for P1 – Rough Turning on CNC (all) -- edit it instead.')
    expect(r.rows[1]).toBeUndefined()
  })

  it('bulkPayloads skips blank rows', () => {
    const p = bulkPayloads(CAT, [row(), row({ quality_parameter: 'OD', standard: '1' }), row({ check_type: 'Gauge' })], ALL)
    expect(p.map((x) => x.quality_parameter)).toEqual(['OD'])
  })
})

describe('rowFromDbError', () => {
  const rows = [row({ quality_parameter: 'OD' }), row(), row({ quality_parameter: 'Length' }), row({ quality_parameter: 'Thread' })]
  it('one row named in message / details / hint -> its grid index', () => {
    expect(rowFromDbError({ message: 'duplicate key value violates unique constraint', details: 'Key (part_serial_number, quality_parameter)=(P1, Length) already exists.' }, rows)).toBe(2)
    expect(rowFromDbError({ message: 'Thread: check type must be Gauge' }, rows)).toBe(3)
    expect(rowFromDbError({ message: 'x', hint: 'see od' }, rows)).toBe(0) // case-insensitive
  })
  it('whole words only; none or several -> null', () => {
    expect(rowFromDbError({ message: 'Threaded rod refused' }, rows)).toBeNull()
    expect(rowFromDbError({ message: 'new row violates check constraint' }, rows)).toBeNull()
    expect(rowFromDbError({ message: 'OD and Length clash' }, rows)).toBeNull()
    expect(rowFromDbError(null, rows)).toBeNull()
  })
})

describe('Copy from', () => {
  const records = [
    { id: 1, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD', check_type: 'Measured', standard: 50, upper_tolerance: 0.1, lower_tolerance: null, gauge_ref: 'Mic' },
    { id: 2, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'Thread', check_type: 'Gauge', gauge_standard: 'M8' },
    { id: 3, part_serial_number: 'P1', machine_id: 'MC-004', machine_category: null, type_of_operation: 'Rough Turning', quality_parameter: 'Other' },
  ]
  it('picks only the same part + operation + target; rows editable, no ids', () => {
    const rows = copyRows(sourceRecords(records, { ...CAT, machine_category: 'cnc' }, ALL))
    expect(rows).toEqual([
      { quality_parameter: 'OD', check_type: 'Measured', standard: '50', upper_tolerance: '0.1', lower_tolerance: '', gauge_standard: '', gauge_ref: 'Mic', remarks: '' },
      { quality_parameter: 'Thread', check_type: 'Gauge', standard: '', upper_tolerance: '', lower_tolerance: '', gauge_standard: 'M8', gauge_ref: '', remarks: '' },
    ])
    expect(copyRows(sourceRecords(records, { ...CAT, applies_to: 'machine', machine_id: 'MC-004' }, ALL)).map((r) => r.quality_parameter)).toEqual(['Other'])
  })
})
