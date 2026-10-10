import { describe, expect, it } from 'vitest'
import {
  COMPLAINT_STATUS_OPTIONS,
  INVESTIGATION_KEYS,
  REGISTRATION_KEYS,
  complaintListRows,
  complaintToForm,
  emptyComplaintForm,
  filterComplaintRows,
  investigationPayload,
  registrationPayload,
  statusOptionsForRole,
  validateInvestigation,
  validateRegistration,
} from './customerComplaints'

const filled = (overrides = {}) => ({
  ...emptyComplaintForm('2026-10-10'),
  customer_id: 'C001',
  part_serial_number: 'HPV2',
  ...overrides,
})

describe('registrationPayload', () => {
  it('sends sections 1-3 only, status Open, never a complaint_no', () => {
    const p = registrationPayload(filled({ root_cause: 'x', status: 'Closed' }))
    expect(Object.keys(p).sort()).toEqual([...REGISTRATION_KEYS, 'status'].sort())
    expect(p.status).toBe('Open')
    expect(p).not.toHaveProperty('complaint_no')
  })

  it('blank number / date / select -> null, numbers converted, text trimmed', () => {
    const p = registrationPayload(filled({ qty_supplied: '100', qty_complained: '', manufacturing_date: '', severity: '', invoice_no: ' INV-1 ' }))
    expect(p.qty_supplied).toBe(100)
    expect(p.qty_complained).toBeNull()
    expect(p.manufacturing_date).toBeNull()
    expect(p.severity).toBeNull()
    expect(p.invoice_no).toBe('INV-1')
  })

  it('blank or whitespace-only text -> null', () => {
    const p = registrationPayload(filled({ customer_po_no: '', batch_lot_no: '   ', complaint_description: '' }))
    expect(p.customer_po_no).toBeNull()
    expect(p.batch_lot_no).toBeNull()
    expect(p.complaint_description).toBeNull()
    expect(p.customer_id).toBe('C001')
  })
})

describe('investigationPayload', () => {
  it('sends sections 4-7 only, Yes/No as booleans, blank employee as null', () => {
    const p = investigationPayload(filled({ rework_required: 'true', customer_acceptance: 'false', closed_by: '', replacement_qty: '5' }))
    expect(Object.keys(p).sort()).toEqual([...INVESTIGATION_KEYS].sort())
    expect(p.rework_required).toBe(true)
    expect(p.customer_acceptance).toBe(false)
    expect(p.replacement_required).toBeNull()
    expect(p.closed_by).toBeNull()
    expect(p.replacement_qty).toBe(5)
    expect(p.root_cause).toBeNull()
    expect(p.closure_remarks).toBeNull()
    expect(p.status).toBe('Open')
  })
})

describe('complaintToForm', () => {
  it('turns nulls into "" and booleans into "true"/"false"', () => {
    const f = complaintToForm({ complaint_no: 'CMP-2026-0001', customer_id: 'C1', qty_complained: 3, rework_required: true, closure_date: null })
    expect(f.customer_id).toBe('C1')
    expect(f.qty_complained).toBe('3')
    expect(f.rework_required).toBe('true')
    expect(f.closure_date).toBe('')
  })
})

describe('validateRegistration', () => {
  it('requires date, customer and part', () => {
    expect(validateRegistration(filled({ customer_id: '' }))).toMatch(/required/)
    expect(validateRegistration(filled())).toBeNull()
  })
  it('rejects negative quantities and complained > supplied', () => {
    expect(validateRegistration(filled({ qty_supplied: '-1' }))).toMatch(/negative/)
    expect(validateRegistration(filled({ qty_supplied: '10', qty_complained: '11' }))).toMatch(/more than/)
    expect(validateRegistration(filled({ qty_supplied: '10', qty_complained: '10' }))).toBeNull()
  })
})

describe('closing a complaint', () => {
  it('only supervisor/admin get the Closed option', () => {
    expect(statusOptionsForRole('operator', 'Open')).not.toContain('Closed')
    expect(statusOptionsForRole('supervisor', 'Open')).toEqual(COMPLAINT_STATUS_OPTIONS)
    expect(statusOptionsForRole('admin', 'Open')).toContain('Closed')
  })
  it('an operator cannot close; a supervisor needs closure date + closed by', () => {
    const closing = filled({ status: 'Closed' })
    expect(validateInvestigation(closing, 'operator', 'Open')).toMatch(/supervisor or admin/)
    expect(validateInvestigation(closing, 'supervisor', 'Open')).toMatch(/Closure Date and Closed By/)
    expect(validateInvestigation({ ...closing, closure_date: '2026-10-10', closed_by: 'E1' }, 'admin', 'Open')).toBeNull()
    expect(validateInvestigation(filled({ status: 'Resolved' }), 'operator', 'Open')).toBeNull()
  })
})

describe('complaint list', () => {
  const rows = complaintListRows(
    [
      { complaint_no: 'CMP-2026-0002', customer_id: 'C1', part_serial_number: 'P1', status: 'Open', priority: 'High' },
      { complaint_no: 'CMP-2026-0001', customer_id: 'C9', part_serial_number: 'P9', status: 'Closed' },
    ],
    [{ customer_id: 'C1', customer_name: 'Acme' }],
    [{ part_serial_number: 'P1', part_name: 'Valve' }]
  )
  it('numbers rows and resolves names, falling back to codes', () => {
    expect(rows.map((r) => r.sl_no)).toEqual([1, 2])
    expect(rows[0].customer_name).toBe('Acme')
    expect(rows[0].part_label).toBe('P1 – Valve')
    expect(rows[1].customer_name).toBe('C9')
    expect(rows[1].part_label).toBe('P9')
  })
  it('searches complaint no, customer, part and status', () => {
    expect(filterComplaintRows(rows, 'acme')).toHaveLength(1)
    expect(filterComplaintRows(rows, 'valve')).toHaveLength(1)
    expect(filterComplaintRows(rows, 'closed').map((r) => r.complaint_no)).toEqual(['CMP-2026-0001'])
    expect(filterComplaintRows(rows, '')).toHaveLength(2)
  })
})
