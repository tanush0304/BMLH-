import { describe, it, expect } from 'vitest'
import { orderLines, poSummary, monthsBetween, monthlyPoVsDispatch, isDcOverdue, jobOrderRows, jobOrderCounts, stageBackText, dcTableStatusLabel, dcStatusCellText } from './reportOrders'

describe('customer orders', () => {
  const orders = [
    { prd_no: 'P1', customer_id: 'C1', po_number: 'PO-1', po_date: '2026-08-10', order_qty: 100 },
    { prd_no: 'P2', customer_id: 'C1', po_number: 'PO-1', po_date: '2026-08-10', order_qty: 50 },
    { prd_no: 'P3', customer_id: 'C2', po_number: 'PO-9', po_date: '2026-09-02', order_qty: 20 },
  ]
  const lines = orderLines(orders, new Map([['P1', 100], ['P2', 10], ['P3', 25]]))

  it('sums dispatches over the PRDs of a PO line (030 batches)', () => {
    const line = [{ order_line_id: 7, prd_no: null, customer_id: 'C1', po_number: 'PO-5', order_qty: 1600 }]
    const byLine = new Map([[7, ['PRD-010', 'PRD-011', 'PRD-012', 'PRD-013']]])
    const [l] = orderLines(line, new Map([['PRD-010', 500], ['PRD-011', 500], ['PRD-012', 500], ['PRD-013', 100]]), byLine)
    expect([l.dispatched, l.status, l.prd_list]).toEqual([1600, 'Closed', 'PRD-010, PRD-011, PRD-012, PRD-013'])
    const [open] = orderLines(line, new Map([['PRD-010', 500]]), byLine)
    expect([open.dispatched, open.status]).toEqual([500, 'Open'])
  })
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
  it('flags overdue only on open DCs past the expected date (view flag wins)', () => {
    expect(isDcOverdue({ status: 'Sent', expected_receipt_date: '2026-10-11' }, today)).toBe(true)
    expect(isDcOverdue({ status: 'Partially Received', expected_receipt_date: '2026-10-12' }, today)).toBe(false) // due today
    expect(isDcOverdue({ status: 'Received', expected_receipt_date: '2026-10-01' }, today)).toBe(false)
    expect(isDcOverdue({ status: 'Sent', expected_receipt_date: '2026-10-30', is_overdue: true }, today)).toBe(true)
  })
  it('computes pending (open balance), short qty (Closed Short) and counts', () => {
    const rows = jobOrderRows([
      { status: 'Closed Short', qty: 42, qty_received: 40 },
      { status: 'Received', qty: 19, qty_received: 19 },
      { status: 'Partially Received', qty: 300, qty_received: 100, expected_receipt_date: '2026-10-01' },
      { status: 'Sent', qty: 30, qty_received: null, expected_receipt_date: '2026-10-30' },
      { status: 'Closed Short', qty: 200, qty_received: null },
    ], today)
    expect(rows.map((r) => [r.status, r.pending, r.short_qty, r.overdue])).toEqual([
      ['Closed Short', 0, 2, false],
      ['Received', 0, 0, false],
      ['Partially Received', 200, 0, true],
      ['Sent', 30, 0, false],
      ['Closed Short', 0, 200, false],
    ])
    expect(jobOrderCounts(rows)).toMatchObject({ total: 5, received: 1, closedShort: 2, closed: 3, partial: 1, sent: 1, pending: 2, overdue: 1, closedPct: 60 })
  })
  it('describes a stage as "N of M back"', () => {
    expect(stageBackText({ dc_count: 2, received_qty: 300, sent_qty: 500 })).toBe('300 of 500 back')
    expect(stageBackText({ dc_count: 0, received_qty: 0, sent_qty: 0 })).toBe('Not sent')
  })
})

describe('dcTableStatusLabel (Job Order dashboard table label)', () => {
  it('shows Closed Short as "Partially Received (Closed)"', () => {
    expect(dcTableStatusLabel('Closed Short')).toBe('Partially Received (Closed)')
  })
  it('leaves every other status as stored', () => {
    for (const s of ['Sent', 'Partially Received', 'Received', 'Overdue']) expect(dcTableStatusLabel(s)).toBe(s)
  })
  it('cell / Excel / PDF text uses the same label, with (Overdue) when late', () => {
    expect(dcStatusCellText('Closed Short', false)).toBe('Partially Received (Closed)')
    expect(dcStatusCellText('Partially Received', true)).toBe('Partially Received (Overdue)')
    expect(dcStatusCellText('Sent', false)).toBe('Sent')
  })
})
