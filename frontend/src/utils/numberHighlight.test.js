import { describe, it, expect } from 'vitest'
import { isQuantityColumn } from './numberHighlight'

describe('isQuantityColumn', () => {
  it('highlights quantity / amount columns', () => {
    for (const key of ['qty', 'order_qty', 'qty_received', 'closing_stock', 'opening_stock', 'receipts', 'issued', 'balance_to_be_despatched', 'quantity_despatched', 'total_available_wip_quantity', 'units_producible', 'batch_qty', 'amount']) {
      expect(isQuantityColumn({ key })).toBe(true)
    }
  })
  it('honours numeric: true', () => {
    expect(isQuantityColumn({ key: 'stage_seq', numeric: true })).toBe(true)
  })
  it('leaves text, dates, ids and status alone', () => {
    for (const key of ['prd_no', 'dispatch_date', 'part_name', 'customer_id', 'unit_of_measurement', 'remarks', 'stock_status']) {
      expect(isQuantityColumn({ key })).toBe(false)
    }
    expect(isQuantityColumn({ key: 'qty', type: 'status' })).toBe(false)
  })
})
