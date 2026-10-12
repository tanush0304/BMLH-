import { describe, it, expect } from 'vitest'
import { stockMovement, dailyBalance, dailyMovement, topN, sumByUom, dominantUom } from './reportStock'

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
