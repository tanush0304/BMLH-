import { describe, expect, it } from 'vitest'
import { orderTypeForPrd } from './orderType'

describe('orderTypeForPrd (FG Despatch read-only Type of Order)', () => {
  const orders = [
    { prd_no: 'PRD-001', order_line_id: 1, order_type: 'Manufacturing' },
    { prd_no: 'PRD-002', order_line_id: 2, order_type: 'Labour' },
    { prd_no: 'PRD-003', order_line_id: 3, order_type: null },
  ]
  it("returns the PRD's PO line order type", () => {
    expect(orderTypeForPrd(orders, 'PRD-001')).toBe('Manufacturing')
    expect(orderTypeForPrd(orders, 'PRD-002')).toBe('Labour')
  })
  it('blank when not set, PRD unknown or none picked', () => {
    expect(orderTypeForPrd(orders, 'PRD-003')).toBe('')
    expect(orderTypeForPrd(orders, 'PRD-999')).toBe('')
    expect(orderTypeForPrd(orders, '')).toBe('')
  })
})
