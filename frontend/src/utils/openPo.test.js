// Phase D (043): annual / open PO rules -- same as the DB guards / view.
import { describe, it, expect } from 'vitest'
import {
  fmtQtyIn,
  effectiveLineStatus,
  despatchedByLine,
  prdState,
  orderQtyProblem,
  cancelLineProblem,
  poExpired,
  planningLineAllowed,
  reportLineIncluded,
  poStatusCounts,
  expiredPoItems,
  poFromMode,
} from './openPo'

describe('fmtQtyIn (Indian grouping, as the DB message)', () => {
  it('groups', () => {
    expect(fmtQtyIn(250)).toBe('250')
    expect(fmtQtyIn(8000)).toBe('8,000')
    expect(fmtQtyIn(100000)).toBe('1,00,000')
    expect(fmtQtyIn(1234567)).toBe('12,34,567')
    expect(fmtQtyIn(0)).toBe('0')
  })
})

describe('order qty change', () => {
  const base = { planned: 8000, unstartedPrds: ['PRD-014', 'PRD-015'] }
  it('increase is always fine', () => {
    expect(orderQtyProblem({ ...base, newQty: '12000' })).toBeNull()
  })
  it('decrease down to planned is fine', () => {
    expect(orderQtyProblem({ ...base, newQty: '8000' })).toBeNull()
  })
  it('below planned is refused, naming unstarted PRDs', () => {
    expect(orderQtyProblem({ ...base, newQty: '7999' })).toBe(
      'Already planned 8,000 -- reduce to at least 8,000, or cancel unstarted PRDs (PRD-014, PRD-015) first.'
    )
  })
  it('below planned with nothing unstarted', () => {
    expect(orderQtyProblem({ planned: 500, newQty: 100 })).toBe('Already planned 500 -- reduce to at least 500.')
  })
  it('blank / zero / fraction refused', () => {
    for (const v of ['', '0', '-5', '2.5', 'abc']) expect(orderQtyProblem({ newQty: v })).toMatch(/whole number/)
  })
})

describe('effective line status (auto close at despatch, void reopens)', () => {
  const prds = [{ prd_no: 'PRD-1', order_line_id: 7 }, { prd_no: 'PRD-2', order_line_id: 7 }]
  const fg = [
    { prd_no: 'PRD-1', transaction_type: 'Dispatch', qty: 600 },
    { prd_no: 'PRD-2', transaction_type: 'Dispatch', qty: 400 },
    { prd_no: 'PRD-2', transaction_type: 'Receipt', qty: 999 },
  ]
  it('Closed when despatched >= order qty', () => {
    const d = despatchedByLine(fg, prds).get(7)
    expect(d).toBe(1000)
    expect(effectiveLineStatus({ stored: 'Open', orderQty: 1000, despatched: d })).toBe('Closed')
  })
  it('a voided despatch reopens the line', () => {
    const voided = fg.map((t, i) => (i === 1 ? { ...t, voided_at: '2026-11-09T10:00:00Z' } : t))
    const d = despatchedByLine(voided, prds).get(7)
    expect(d).toBe(600)
    expect(effectiveLineStatus({ stored: 'Open', orderQty: 1000, despatched: d })).toBe('Open')
  })
  it('a qty increase reopens a closed line', () => {
    expect(effectiveLineStatus({ stored: 'Open', orderQty: 1500, despatched: 1000 })).toBe('Open')
  })
  it('Cancelled wins; zero qty never Closed', () => {
    expect(effectiveLineStatus({ stored: 'Cancelled', orderQty: 10, despatched: 10 })).toBe('Cancelled')
    expect(effectiveLineStatus({ stored: 'Open', orderQty: 0, despatched: 0 })).toBe('Open')
  })
})

describe('PRD state', () => {
  it('unstarted / in production / finished', () => {
    expect(prdState([{ status: 'Pending' }, { status: 'Pending' }], false)).toBe('unstarted')
    expect(prdState([{ status: 'Pending' }], true)).toBe('in_production') // started then End-Logged
    expect(prdState([{ status: 'Completed' }, { status: 'Pending' }], true)).toBe('in_production')
    expect(prdState([{ status: 'Completed' }, { status: 'Received' }], true)).toBe('finished')
  })
})

describe('cancel line', () => {
  it('needs a reason', () => {
    expect(cancelLineProblem({ reason: '  ', prds: [] })).toMatch(/reason is required/)
  })
  it('refused while PRDs are unstarted or in production, naming them', () => {
    const msg = cancelLineProblem({
      reason: 'customer dropped it',
      prds: [
        { prd_no: 'PRD-015', state: 'unstarted' },
        { prd_no: 'PRD-014', state: 'unstarted' },
        { prd_no: 'PRD-012', state: 'in_production' },
        { prd_no: 'PRD-010', state: 'finished' },
      ],
    })
    expect(msg).toBe(
      'Cannot cancel this PO line: cancel unstarted PRDs (PRD-014, PRD-015) in Production Planning first; PRDs still in production (PRD-012) -- finish them first'
    )
  })
  it('allowed once every PRD has finished production (even with FG not despatched) or with no PRDs', () => {
    expect(cancelLineProblem({ reason: 'x', prds: [{ prd_no: 'PRD-010', state: 'finished' }] })).toBeNull()
    expect(cancelLineProblem({ reason: 'x', prds: [] })).toBeNull()
  })
  it('already cancelled', () => {
    expect(cancelLineProblem({ reason: 'x', status: 'Cancelled' })).toMatch(/already cancelled/)
  })
})

describe('planning filter + validity', () => {
  it('only Open lines of Open POs (no header = allowed)', () => {
    expect(planningLineAllowed('Open', { po_status: 'Open' })).toBe(true)
    expect(planningLineAllowed('Open', undefined)).toBe(true)
    expect(planningLineAllowed('Open', { po_status: 'Closed' })).toBe(false)
    expect(planningLineAllowed('Closed', { po_status: 'Open' })).toBe(false)
    expect(planningLineAllowed('Cancelled', { po_status: 'Open' })).toBe(false)
  })
  it('expired = Valid To before today, Open POs only', () => {
    expect(poExpired({ valid_to: '2026-11-08', po_status: 'Open' }, '2026-11-09')).toBe(true)
    expect(poExpired({ valid_to: '2026-11-09', po_status: 'Open' }, '2026-11-09')).toBe(false)
    expect(poExpired({ valid_to: null, po_status: 'Open' }, '2026-11-09')).toBe(false)
    expect(poExpired({ valid_to: '2026-01-01', po_status: 'Closed' }, '2026-11-09')).toBe(false)
  })
})

describe('Customer Order Status rows + counts', () => {
  const period = { from: '2026-10-01', to: '2026-10-31' }
  it('dated in period, or still Open dated up to To', () => {
    expect(reportLineIncluded({ po_date: '2026-10-05', line_status: 'Closed' }, period)).toBe(true)
    expect(reportLineIncluded({ po_date: '2025-04-01', line_status: 'Open' }, period)).toBe(true) // annual PO
    expect(reportLineIncluded({ po_date: '2025-04-01', line_status: 'Closed' }, period)).toBe(false)
    expect(reportLineIncluded({ po_date: '2025-04-01', line_status: 'Cancelled' }, period)).toBe(false)
    expect(reportLineIncluded({ po_date: '2026-11-05', line_status: 'Open' }, period)).toBe(false) // after To
  })
  it('POs by header status; cancelled lines apart and out of qty', () => {
    const headers = [
      { id: 1, po_status: 'Open' },
      { id: 2, po_status: 'Closed' },
      { id: 3, po_status: 'Open' }, // no line shown -> not counted
    ]
    const lines = [
      { parent_po_id: 1, order_qty: 100, line_status: 'Open' },
      { parent_po_id: 1, order_qty: 50, line_status: 'Cancelled' },
      { parent_po_id: 1, order_qty: 30, line_status: 'Closed' },
      { parent_po_id: 2, order_qty: 70, line_status: 'Closed' },
    ]
    expect(poStatusCounts(headers, lines)).toEqual({
      total: 2, open: 1, closed: 1, openQty: 130, closedQty: 70, cancelledLines: 1, openLines: 1, closedLines: 2,
    })
  })
})

describe('bell: PO validity ended', () => {
  it('Open POs past Valid To with open lines, opens the PO view', () => {
    const items = expiredPoItems({
      today: '2026-11-09',
      headers: [
        { id: 4, po_number: 'PO-A', valid_to: '2026-03-31', po_status: 'Open' },
        { id: 5, po_number: 'PO-B', valid_to: '2026-03-31', po_status: 'Open' }, // no open line
        { id: 6, po_number: 'PO-C', valid_to: '2026-12-31', po_status: 'Open' }, // still valid
        { id: 7, po_number: 'PO-D', valid_to: '2026-01-31', po_status: 'Closed' },
      ],
      lineStatuses: [
        { parent_po_id: 4, line_status: 'Open' },
        { parent_po_id: 4, line_status: 'Open' },
        { parent_po_id: 4, line_status: 'Closed' },
        { parent_po_id: 5, line_status: 'Closed' },
        { parent_po_id: 6, line_status: 'Open' },
        { parent_po_id: 7, line_status: 'Open' },
      ],
    })
    expect(items).toEqual([
      { id: 'po:4', text: 'PO PO-A validity ended on 31-03-2026 -- 2 lines still open', open: { topKey: 'customer-order', subKey: 'order', mode: 'po:4' } },
    ])
    expect(poFromMode('po:4')).toBe(4)
    expect(poFromMode('dc:DC-1')).toBeNull()
  })
})
