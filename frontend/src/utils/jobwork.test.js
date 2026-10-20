import { describe, expect, it } from 'vitest'
import {
  dcBalance,
  receiptQtyError,
  closeShortReasonError,
  openDcLabel,
  dcEditBlockReason,
  receiptEditBlockReason,
  dispatchEditLimits,
  dispatchLimitText,
  dispatchEditError,
  dispatchEditPatch,
  vendorLocked,
  receiptEditMax,
  receiptEditError,
  receiptEditPatch,
  jobworkDbErrorMessage,
} from './jobwork'

describe('jobwork DC helpers', () => {
  const dc = { dc_no: 'DC-004', qty: 300, qty_received: 100 }

  it('balance = sent - received so far', () => {
    expect(dcBalance(dc)).toBe(200)
    expect(dcBalance({ qty: 30, qty_received: null })).toBe(30)
  })

  it('receipt qty must be > 0 and within the balance (over-receipt blocked)', () => {
    expect(receiptQtyError('200', dc)).toBeNull()
    expect(receiptQtyError('250', dc)).toBe('Qty Received (250) is more than the balance on DC-004 (200).')
    expect(receiptQtyError('0', dc)).toMatch(/greater than zero/)
    expect(receiptQtyError('', dc)).toMatch(/greater than zero/)
  })

  it('close short needs a reason', () => {
    expect(closeShortReasonError('  ')).toMatch(/reason/)
    expect(closeShortReasonError('Vendor scrapped 10')).toBeNull()
  })

  it('labels an open DC with vendor and what is still to come', () => {
    expect(openDcLabel(dc, 'Vendor A')).toBe('DC-004 · Vendor A · 200 of 300 to come')
  })
})

describe('jobwork edit helpers (033)', () => {
  const open = { dc_no: 'DC-004', qty: 300, qty_received: 100, vendor_id: 'V1', is_open: true, closed_short_at: null, status: 'Partially Received' }
  const fresh = { ...open, qty_received: 0, status: 'Sent' }

  it('edit is disabled with a reason on Received / Closed Short DCs', () => {
    expect(dcEditBlockReason(open)).toBeNull()
    expect(dcEditBlockReason({ ...open, is_open: false, qty_received: 300 })).toBe('DC-004 is Received -- a closed DC can no longer be edited.')
    expect(dcEditBlockReason({ ...open, is_open: false, closed_short_at: '2026-10-15' })).toContain('Partially Received (Closed)')
  })

  it('receipts of a closed DC cannot be edited', () => {
    const r = { receipt_no: 'JR-003', dc_no: 'DC-004', qty_received: 100 }
    expect(receiptEditBlockReason(r, open)).toBeNull()
    expect(receiptEditBlockReason(r, { ...open, is_open: false, status: 'Received' })).toBe('JR-003 is on a closed DC (Received) -- it can no longer be edited.')
    expect(receiptEditBlockReason(r, { ...open, is_open: false, closed_short_at: 'x', status: 'Closed Short' })).toContain('Partially Received (Closed)')
  })

  it('limit text: min received, max = stage available + this DC qty', () => {
    const limits = dispatchEditLimits(open, 50)
    expect(limits).toEqual({ min: 100, max: 350 })
    expect(dispatchLimitText(limits)).toBe('min 100 (received) · max 350 (available)')
    expect(dispatchLimitText(dispatchEditLimits(open, null))).toBe('min 100 (received)')
  })

  it('dispatch qty below received / above available is refused', () => {
    const limits = dispatchEditLimits(open, 50)
    const draft = { qty: '300', dispatch_date: '2026-10-15', vendor_id: 'V1' }
    expect(dispatchEditError(draft, open, limits)).toBeNull()
    expect(dispatchEditError({ ...draft, qty: '99' }, open, limits)).toMatch(/cannot be less than the qty already received on DC-004 \(100\)/)
    expect(dispatchEditError({ ...draft, qty: '351' }, open, limits)).toMatch(/max 350/)
    expect(dispatchEditError({ ...draft, qty: '100' }, open, limits)).toBeNull() // = received: DC closes
    expect(dispatchEditError({ ...draft, qty: '0' }, open, limits)).toMatch(/greater than zero/)
  })

  it('vendor is locked once anything is received', () => {
    expect(vendorLocked(open)).toBe(true)
    expect(vendorLocked(fresh)).toBe(false)
    const limits = dispatchEditLimits(open, 0)
    expect(dispatchEditError({ qty: '300', dispatch_date: '2026-10-15', vendor_id: 'V2' }, open, limits)).toMatch(/Vendor cannot be changed/)
    expect(dispatchEditError({ qty: '300', dispatch_date: '2026-10-15', vendor_id: 'V2' }, fresh, limits)).toBeNull()
  })

  it('dispatch patch has only qty, dispatch_date and (while unlocked) vendor_id', () => {
    const draft = { qty: '250', dispatch_date: '2026-10-14', vendor_id: 'V2', expected_receipt_date: 'x', is_open: false, updated_at: 'x', edited_by: 'x' }
    expect(dispatchEditPatch(draft, fresh)).toEqual({ qty: 250, dispatch_date: '2026-10-14', vendor_id: 'V2' })
    expect(dispatchEditPatch(draft, open)).toEqual({ qty: 250, dispatch_date: '2026-10-14' })
  })

  it('receipt edit: max = DC balance + this receipt; patch has only qty_received + receipt_date', () => {
    const r = { receipt_no: 'JR-003', dc_no: 'DC-004', qty_received: 100 }
    expect(receiptEditMax(r, open)).toBe(300)
    expect(receiptEditError({ qty_received: '300', receipt_date: '2026-10-16' }, r, open)).toBeNull() // makes the DC fully received
    expect(receiptEditError({ qty_received: '301', receipt_date: '2026-10-16' }, r, open)).toBe('Qty Received (301) is more than the balance on DC-004 (max 300).')
    expect(receiptEditError({ qty_received: '', receipt_date: '2026-10-16' }, r, open)).toMatch(/greater than zero/)
    expect(receiptEditPatch({ qty_received: '120', receipt_date: '2026-10-16', is_open: true, edited_at: 'x' })).toEqual({ qty_received: 120, receipt_date: '2026-10-16' })
  })

  it('DB errors: 033 messages shown as is, bare permission denied translated', () => {
    const limit = { code: '23514', message: 'Dispatch qty (400) is more than the qty available for this stage (max 350)' }
    expect(jobworkDbErrorMessage(limit)).toBe(limit.message)
    const guard = { code: '42501', message: 'Only a supervisor or admin can edit a dispatch' }
    expect(jobworkDbErrorMessage(guard)).toBe(guard.message)
    expect(jobworkDbErrorMessage({ code: '42501', message: 'permission denied for table job order receipt' })).toMatch(/supervisor or admin only/)
    expect(jobworkDbErrorMessage({ code: 'XX000', message: 'boom' })).toBe('boom')
    expect(jobworkDbErrorMessage({})).toBe('Could not save the change.')
  })
})
