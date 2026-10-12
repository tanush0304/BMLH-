import { describe, it, expect } from 'vitest'
import { orderLines, poSummary, monthsBetween, monthlyPoVsDispatch, jobOrderStatus, jobOrderRows, jobOrderCounts } from './reportOrders'

describe('customer orders', () => {
  const orders = [
    { prd_no: 'P1', customer_id: 'C1', po_number: 'PO-1', po_date: '2026-08-10', order_qty: 100 },
    { prd_no: 'P2', customer_id: 'C1', po_number: 'PO-1', po_date: '2026-08-10', order_qty: 50 },
    { prd_no: 'P3', customer_id: 'C2', po_number: 'PO-9', po_date: '2026-09-02', order_qty: 20 },
  ]
  const lines = orderLines(orders, new Map([['P1', 100], ['P2', 10], ['P3', 25]]))

  it('closes a line when dispatched >= order qty', () => {
    expect(lines.map((l) => l.status)).toEqual(['Closed', 'Open', 'Closed'])
  })
  it('closes a PO only when every line is closed', () => {
    expect(poSummary(lines)).toEqual({ total: 2, open: 1, openQty: 150, closed: 1, closedQty: 20 })
  })
  it('builds months across a year boundary', () => {
    expect(monthsBetween('2025-11-15', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
  it('sums PO qty by PO month and dispatches by dispatch month', () => {
    const d = [{ prd_no: 'P1', qty: 60, transaction_date: '2026-08-20' }, { prd_no: 'P1', qty: 40, transaction_date: '2026-09-01' }, { prd_no: 'PX', qty: 5, transaction_date: '2026-09-01' }]
    expect(monthlyPoVsDispatch(lines, d, ['2026-08', '2026-09'])).toEqual([
      { month: '2026-08', label: 'Aug 2026', po: 150, dispatched: 60 },
      { month: '2026-09', label: 'Sep 2026', po: 20, dispatched: 40 },
    ])
  })
})

describe('job orders', () => {
  const today = '2026-10-12'
  it('derives Closed / Overdue / Open', () => {
    expect(jobOrderStatus({ receipt_date: '2026-10-01', qty_received: 10 }, today)).toBe('Closed')
    expect(jobOrderStatus({ expected_receipt_date: '2026-10-11' }, today)).toBe('Overdue')
    expect(jobOrderStatus({ expected_receipt_date: '2026-10-12' }, today)).toBe('Open') // due today = not yet overdue
    expect(jobOrderStatus({ expected_receipt_date: null }, today)).toBe('Open')
  })
  it('computes pending qty and counts', () => {
    const rows = jobOrderRows([
      { qty: 100, qty_received: 90, receipt_date: '2026-10-01' },
      { qty: 50, expected_receipt_date: '2026-10-01' },
      { qty: 30, expected_receipt_date: '2026-10-30' },
    ], today)
    expect(rows.map((r) => [r.status, r.pending])).toEqual([['Closed', 10], ['Overdue', 50], ['Open', 30]])
    expect(jobOrderCounts(rows)).toMatchObject({ total: 3, closed: 1, pending: 2, overdue: 1, closedPct: 33.3 })
  })
})
