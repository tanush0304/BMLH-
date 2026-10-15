import { describe, expect, it } from 'vitest'
import { dcBalance, receiptQtyError, closeShortReasonError, openDcLabel } from './jobwork'

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
