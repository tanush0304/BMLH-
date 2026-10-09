import { describe, it, expect } from 'vitest'
import {
  canEditStock,
  stockEditPatch,
  validateRmIssueEdit,
  validateFgDispatchEdit,
  validateWipIssueEdit,
  validateReceiptEdit,
  editedLabel,
} from './stockEdit'

describe('canEditStock', () => {
  it('is supervisor/admin only', () => {
    expect(canEditStock('supervisor')).toBe(true)
    expect(canEditStock('admin')).toBe(true)
    expect(canEditStock('operator')).toBe(false)
    expect(canEditStock(null)).toBe(false)
  })
})

describe('stockEditPatch', () => {
  it('sends only the editable fields', () => {
    expect(stockEditPatch({ qty: '5', transaction_date: '2026-10-01', remarks: ' fix ', doc_no: 'GRN-001', raw_material_code: 'X' }))
      .toEqual({ qty: 5, transaction_date: '2026-10-01', remarks: 'fix' })
    expect(stockEditPatch({ qty: '5', transaction_date: '', remarks: '', supplier_id: '' }, { withSupplier: true }))
      .toEqual({ qty: 5, transaction_date: null, remarks: null, supplier_id: null })
  })
  it('maps to other column names (requisitions)', () => {
    expect(stockEditPatch({ qty: '3', transaction_date: '2026-10-02' }, { withRemarks: false, qtyKey: 'qty_required', dateKey: 'order_date' }))
      .toEqual({ qty_required: 3, order_date: '2026-10-02' })
  })
})

describe('issue edits exclude the row being edited', () => {
  it('RM issue: stock 10 after an issue of 4 -> can raise it to 14, not 15', () => {
    expect(validateRmIssueEdit('14', 4, 10)).toBeNull()
    expect(validateRmIssueEdit('15', 4, 10)).toMatch(/more than the current stock/)
  })
  it('FG dispatch: limited by stock and order balance, each plus the old qty', () => {
    expect(validateFgDispatchEdit('8', 3, 5, 20)).toBeNull()
    expect(validateFgDispatchEdit('9', 3, 5, 20)).toMatch(/physical FG stock/)
    expect(validateFgDispatchEdit('9', 3, 50, 5)).toMatch(/remaining order quantity/)
  })
  it('WIP issue: pool balance plus the old qty', () => {
    expect(validateWipIssueEdit('6', 2, 4)).toBeNull()
    expect(validateWipIssueEdit('7', 2, 4)).toMatch(/available WIP balance/)
  })
})

describe('validateReceiptEdit', () => {
  it('allows lowering while the balance stays >= 0', () => {
    expect(validateReceiptEdit('4', 10, 6)).toBeNull() // 6 - 10 + 4 = 0
  })
  it('refuses a reduction that makes the balance negative', () => {
    expect(validateReceiptEdit('3', 10, 6)).toMatch(/negative \(-1\)/)
  })
  it('refuses zero / blank', () => {
    expect(validateReceiptEdit('', 10, 6)).toMatch(/greater than zero/)
    expect(validateReceiptEdit('0', 10, 6)).toMatch(/greater than zero/)
  })
})

describe('editedLabel', () => {
  it('is empty for rows never edited', () => {
    expect(editedLabel({ qty: 1 })).toBe('')
  })
  it('names the editor and the previous qty', () => {
    const label = editedLabel(
      { edited_at: '2026-10-09T10:00:00Z', edited_by: 'u1', previous_qty: 7 },
      [{ user_id: 'u1', email: 'sup@example.com' }]
    )
    expect(label).toMatch(/^Edited by sup@example.com on /)
    expect(label).toMatch(/\(qty was 7\)$/)
  })
})
