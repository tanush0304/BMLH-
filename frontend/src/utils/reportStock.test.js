import { describe, it, expect } from 'vitest'
import { stockMovement, dailyBalance, dailyMovement, topN, sumByUom, dominantUom, orderFulfilment, rmMatchesFilters, wipChartState, wipNoStockMessage, WIP_NO_MOVEMENT_MESSAGE } from './reportStock'

const T = (transaction_type, qty, transaction_date, key = 'A') => ({ transaction_type, qty, transaction_date, key })

const TXNS = [
  T('Receipt', 100, '2026-09-20'),
  T('Issue', 30, '2026-09-25'),
  T('Receipt', 50, '2026-10-02'),
  T('Issue', 40, '2026-10-05'),
  T('Issue', 5, '2026-10-05'),
  T('Receipt', 999, '2026-10-20'), // after `to` -- ignored
  T('Receipt', 7, '2026-10-03', 'B'),
]

describe('stockMovement', () => {
  it('splits before / within the period and ignores later rows', () => {
    const m = stockMovement(TXNS, { from: '2026-10-01', to: '2026-10-12', keyFn: (t) => t.key, inType: 'Receipt', outType: 'Issue', openingFor: (k) => (k === 'A' ? 10 : 0) })
    expect(m.get('A')).toEqual({ opening: 80, receipts: 50, issues: 45, closing: 85, lastReceipt: '2026-10-02', lastIssue: '2026-10-05' })
    expect(m.get('B')).toMatchObject({ opening: 0, receipts: 7, closing: 7, lastIssue: null })
  })
})

describe('daily series', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03']
  it('carries the balance forward day by day', () => {
    expect(dailyBalance(TXNS, { days, inType: 'Receipt', outType: 'Issue', openingTotal: 10 })).toEqual([
      { date: '2026-10-01', balance: 80 },
      { date: '2026-10-02', balance: 130 },
      { date: '2026-10-03', balance: 137 },
    ])
  })
  it('adds daily in / out', () => {
    expect(dailyMovement(TXNS, { days, inType: 'Receipt', outType: 'Issue' })[1]).toEqual({ date: '2026-10-02', receipts: 50, issues: 0, balance: 120 })
  })
})

describe('helpers', () => {
  it('topN folds the rest into Others', () => {
    const e = [{ label: 'a', value: 5 }, { label: 'b', value: 9 }, { label: 'c', value: 1 }, { label: 'd', value: 0 }]
    expect(topN(e, 1)).toEqual([{ label: 'b', value: 9 }, { label: 'Others', value: 6 }])
    expect(topN(e, 5).map((x) => x.label)).toEqual(['b', 'a', 'c'])
  })
  it('never adds different UoMs', () => {
    const rows = [{ unit_of_measurement: 'Kg', q: 2.25 }, { unit_of_measurement: 'Nos', q: 5 }, { unit_of_measurement: 'Kg', q: 1 }]
    expect(sumByUom(rows, 'q')).toEqual([{ uom: 'Nos', value: 5 }, { uom: 'Kg', value: 3.3 }])
    expect(dominantUom(rows)).toBe('Kg')
  })
})

describe('orderFulfilment', () => {
  const master = [
    { prd_no: 'PRD-1', order_line_id: 1, order_quantity: 1600 },
    { prd_no: 'PRD-2', order_line_id: 1, order_quantity: 1600 },
    { prd_no: 'PRD-3', order_line_id: 2, order_quantity: 100 },
    { prd_no: 'PRD-4', order_line_id: 3, order_quantity: 50 },
  ]
  const F = (prd_no, transaction_type, qty) => ({ prd_no, transaction_type, qty })
  const txns = [
    F('PRD-1', 'Production Receipt', 40), F('PRD-1', 'Dispatch', 40),
    F('PRD-2', 'Production Receipt', 48), F('PRD-2', 'Dispatch', 30),
    F('PRD-3', 'Production Receipt', 120), F('PRD-3', 'Dispatch', 100),
    F('PRD-4', 'Production Receipt', 50),
  ]
  const opts = { inType: 'Production Receipt', outType: 'Dispatch' }
  it('sums per PO line over all its PRDs; yet to produce never below 0', () => {
    expect(orderFulfilment(master, txns, new Set([1, 2]), opts)).toEqual({
      dispatched: 170, // 40 + 30 + 100
      inStock: 38, // 18 on line 1 + 20 on line 2
      yetToProduce: 1512, // line 1: 1600 - 88; line 2 received more than ordered -> 0
      total: 1720,
    })
  })
  it('only the given lines (customer filter)', () => {
    expect(orderFulfilment(master, txns, new Set([3]), opts)).toEqual({ dispatched: 0, inStock: 50, yetToProduce: 0, total: 50 })
    expect(orderFulfilment(master, txns, new Set(), opts).total).toBe(0)
  })
})

describe('rmMatchesFilters (Raw Material Status filters)', () => {
  const rm = { raw_material_code: 'RM-001', rm_type: 'Bar', unit_of_measurement: 'Kg', supplier_names: 'Tata Steel, Jindal' }
  it('passes with no filters', () => {
    expect(rmMatchesFilters(rm, {})).toBe(true)
    expect(rmMatchesFilters(rm)).toBe(true)
  })
  it('RM Code matches only that code', () => {
    expect(rmMatchesFilters(rm, { rmCode: 'RM-001' })).toBe(true)
    expect(rmMatchesFilters(rm, { rmCode: 'RM-002' })).toBe(false)
  })
  it('combines with Supplier, RM Type and UOM (all must match)', () => {
    expect(rmMatchesFilters(rm, { rmCode: 'RM-001', supplier: 'Jindal', rmType: 'Bar', uom: 'Kg' })).toBe(true)
    expect(rmMatchesFilters(rm, { rmCode: 'RM-001', supplier: 'Other' })).toBe(false)
    expect(rmMatchesFilters(rm, { rmCode: 'RM-001', rmType: 'Plate' })).toBe(false)
    expect(rmMatchesFilters(rm, { rmCode: 'RM-001', uom: 'Nos' })).toBe(false)
  })
})

describe('wipChartState (WIP Status charts)', () => {
  const from = '2026-10-01'
  const to = '2026-10-30'
  const tx = (date, type, qty) => ({ transaction_date: date, transaction_type: type, qty })
  it('rows with balance 0 -> zero; movement inside the period -> moved', () => {
    expect(wipChartState({ rows: [{ balance: 0 }], txns: [tx('2026-10-20', 'Receipt', 20), tx('2026-10-20', 'Issue', 20)], from, to })).toEqual({ balance: 'zero', moved: true })
  })
  it('stock left -> stock; no rows -> none', () => {
    expect(wipChartState({ rows: [{ balance: 5 }, { balance: 0 }], txns: [], from, to }).balance).toBe('stock')
    expect(wipChartState({ rows: [], txns: [], from, to }).balance).toBe('none')
  })
  it('movement only before From or after To is not "moved"; the period bounds are inclusive', () => {
    expect(wipChartState({ rows: [{ balance: 30 }], txns: [tx('2026-09-15', 'Receipt', 30), tx('2026-10-31', 'Issue', 5)], from, to }).moved).toBe(false)
    expect(wipChartState({ rows: [], txns: [tx(from, 'Receipt', 1)], from, to }).moved).toBe(true)
    expect(wipChartState({ rows: [], txns: [tx(to, 'Issue', 1)], from, to }).moved).toBe(true)
  })
  it('messages', () => {
    expect(wipNoStockMessage('30-10-2026')).toBe('No WIP stock at 30-10-2026 -- everything received has been issued.')
    expect(WIP_NO_MOVEMENT_MESSAGE).toBe('No WIP movement in this period')
  })
})

describe('WIP trend data (dailyMovement): same-day receipt + issue', () => {
  it('shows 20 in / 20 out as bars while the closing balance stays 0', () => {
    const txns = [
      { transaction_date: '2026-10-20', transaction_type: 'Receipt', qty: 20 },
      { transaction_date: '2026-10-20', transaction_type: 'Issue', qty: 20 },
    ]
    const days = ['2026-10-19', '2026-10-20', '2026-10-21']
    expect(dailyMovement(txns, { days, inType: 'Receipt', outType: 'Issue' })).toEqual([
      { date: '2026-10-19', receipts: 0, issues: 0, balance: 0 },
      { date: '2026-10-20', receipts: 20, issues: 20, balance: 0 },
      { date: '2026-10-21', receipts: 0, issues: 0, balance: 0 },
    ])
  })
})
