import { describe, it, expect } from 'vitest'
import { employeeLabel, sortedEmployeeOptions, employeeLabelForId } from './employeeLabel'

describe('employeeLabel', () => {
  it('shows "Name (ID)" for a normal employee', () => {
    expect(employeeLabel({ employee_id: 'BMLH-001', employee_name: 'Ravi Kumar' })).toBe('Ravi Kumar (BMLH-001)')
  })

  it('falls back to the bare ID when the name is missing', () => {
    expect(employeeLabel({ employee_id: 'BMLH-002', employee_name: '' })).toBe('BMLH-002')
    expect(employeeLabel({ employee_id: 'BMLH-002', employee_name: null })).toBe('BMLH-002')
  })

  it('never renders "undefined" for a missing/null employee', () => {
    expect(employeeLabel(null)).toBe('')
    expect(employeeLabel(undefined)).toBe('')
    expect(employeeLabel({})).toBe('')
  })
})

describe('employeeLabelForId', () => {
  const EMPLOYEES = [
    { employee_id: 'BMLH-001', employee_name: 'Ravi Kumar' },
    { employee_id: 'BMLH-002', employee_name: '' },
  ]

  it('resolves a known id to "Name (ID)"', () => {
    expect(employeeLabelForId('BMLH-001', EMPLOYEES)).toBe('Ravi Kumar (BMLH-001)')
  })

  it('falls back to the bare ID when that employee has no name', () => {
    expect(employeeLabelForId('BMLH-002', EMPLOYEES)).toBe('BMLH-002')
  })

  it('falls back to the bare ID, never "undefined", when the id is not in the list at all', () => {
    expect(employeeLabelForId('BMLH-999', EMPLOYEES)).toBe('BMLH-999')
  })

  it('blank/missing id returns an empty string, not "undefined"', () => {
    expect(employeeLabelForId('', EMPLOYEES)).toBe('')
    expect(employeeLabelForId(null, EMPLOYEES)).toBe('')
  })
})

describe('sortedEmployeeOptions', () => {
  it('sorts by display name, falling back to ID when a name is missing', () => {
    const employees = [
      { employee_id: 'BMLH-003', employee_name: 'Zara' },
      { employee_id: 'BMLH-001', employee_name: 'Anita' },
      { employee_id: 'BMLH-002', employee_name: '' },
    ]
    const opts = sortedEmployeeOptions(employees)
    expect(opts.map((o) => o.value)).toEqual(['BMLH-001', 'BMLH-002', 'BMLH-003'])
    expect(opts[0].label).toBe('Anita (BMLH-001)')
    expect(opts[1].label).toBe('BMLH-002')
  })
})
