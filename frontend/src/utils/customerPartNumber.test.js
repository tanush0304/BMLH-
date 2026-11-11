// Customer part numbers (045): validation, uniqueness among active rows,
// payload trimming, lookup (active wins; missing row -> "—", never an error).
import { describe, it, expect } from 'vitest'
import {
  customerPartNumberPayload,
  customerPartNumberProblem,
  customerPartMap,
  customerPartFor,
  customerPartForLine,
  customerPartNoText,
  customerDrawingText,
  customerPartLabel,
  customerPartFields,
  partNumbersForCustomer,
} from './customerPartNumber'

const form = (over = {}) => ({ part_serial_number: 'P-1', customer_part_number: 'CPN-1', is_active: true, ...over })

describe('customerPartNumberProblem', () => {
  it('requires our part', () => {
    expect(customerPartNumberProblem(form({ part_serial_number: '  ' }))).toEqual({ field: 'part_serial_number', error: 'Our Part is required.' })
  })
  it('requires the customer part number (blank after trim = missing)', () => {
    expect(customerPartNumberProblem(form({ customer_part_number: '   ' }))).toEqual({ field: 'customer_part_number', error: 'Customer Part No is required.' })
  })
  it('refuses a second ACTIVE row for the same part (case/space-insensitive)', () => {
    const others = [{ part_serial_number: ' p-1 ', is_active: true }]
    expect(customerPartNumberProblem(form(), others)?.error).toBe('P-1 already has a customer part number for this customer -- edit it instead.')
  })
  it('ignores inactive rows, and an inactive save never clashes', () => {
    expect(customerPartNumberProblem(form(), [{ part_serial_number: 'P-1', is_active: false }])).toBeNull()
    expect(customerPartNumberProblem(form({ is_active: false }), [{ part_serial_number: 'P-1', is_active: true }])).toBeNull()
  })
  it('other parts are fine', () => {
    expect(customerPartNumberProblem(form(), [{ part_serial_number: 'P-2', is_active: true }])).toBeNull()
  })
})

describe('customerPartNumberPayload', () => {
  it('trims, blanks -> null, keeps the customer', () => {
    expect(customerPartNumberPayload({ part_serial_number: ' P-1 ', customer_part_number: ' CPN-1 ', customer_part_name: '  ', customer_drawing_ref: ' D-9 ', revision: '', is_active: true }, 'CUST-001')).toEqual({
      customer_id: 'CUST-001',
      part_serial_number: 'P-1',
      customer_part_number: 'CPN-1',
      customer_part_name: null,
      customer_drawing_ref: 'D-9',
      revision: null,
      is_active: true,
    })
  })
})

describe('lookup + display', () => {
  const rows = [
    { id: 1, customer_id: 'C1', part_serial_number: 'P-1', customer_part_number: 'OLD', is_active: false, updated_at: '2026-01-01' },
    { id: 2, customer_id: 'C1', part_serial_number: 'P-1', customer_part_number: 'CPN-1', customer_drawing_ref: 'D-45', revision: 'B', is_active: true, updated_at: '2025-01-01' },
    { id: 3, customer_id: 'C1', part_serial_number: 'P-2', customer_part_number: 'X1', is_active: false, updated_at: '2026-01-01' },
    { id: 4, customer_id: 'C1', part_serial_number: 'P-2', customer_part_number: 'X2', is_active: false, updated_at: '2026-02-01' },
    { id: 5, customer_id: 'C2', part_serial_number: 'P-1', customer_part_number: 'OTHER', is_active: true },
  ]
  const map = customerPartMap(rows)

  it('active row wins; else the latest inactive one; per customer', () => {
    expect(customerPartFor(map, 'C1', 'P-1').id).toBe(2)
    expect(customerPartFor(map, 'C1', 'P-2').id).toBe(4)
    expect(customerPartFor(map, 'C2', 'P-1').id).toBe(5)
  })

  it('no row / no customer / no map -> null, and "—" in every display', () => {
    expect(customerPartFor(map, 'C9', 'P-1')).toBeNull()
    expect(customerPartFor(map, '', 'P-1')).toBeNull()
    expect(customerPartFor(null, 'C1', 'P-1')).toBeNull()
    expect(customerPartForLine(undefined, map)).toBeNull()
    expect(customerPartNoText(null)).toBe('—')
    expect(customerDrawingText(null)).toBe('—')
    expect(customerPartLabel(null)).toBe('—')
    expect(customerPartFields({ customer_id: 'C9', part_serial_number: 'P-1' }, map)).toEqual({ customer_part_no: '—', customer_drawing_ref: '—' })
    expect(customerPartFields(null, null)).toEqual({ customer_part_no: '—', customer_drawing_ref: '—' })
  })

  it('labels', () => {
    const row = customerPartFor(map, 'C1', 'P-1')
    expect(customerPartNoText(row)).toBe('CPN-1')
    expect(customerDrawingText(row)).toBe('D-45 Rev B')
    expect(customerPartLabel(row)).toBe('CPN-1 · Dwg D-45 Rev B')
    expect(customerPartLabel({ customer_part_number: 'X2' })).toBe('X2')
    expect(customerDrawingText({ revision: 'C' })).toBe('Rev C')
    expect(customerPartFields({ customer_id: 'C1', part_serial_number: 'P-1' }, map)).toEqual({ customer_part_no: 'CPN-1', customer_drawing_ref: 'D-45 Rev B' })
  })

  it('partNumbersForCustomer', () => {
    expect(partNumbersForCustomer(rows, 'C1').map((r) => r.id)).toEqual([1, 2, 3, 4])
    expect(partNumbersForCustomer(rows, '')).toEqual([])
  })
})
