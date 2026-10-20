import { describe, it, expect } from 'vitest'
import {
  pct,
  totals,
  productionStatusRows,
  productionStatusKpis,
  dailyTrend,
  byMachine,
  searchRows,
  machineRows,
  machineView,
  changePct,
  changePoints,
  dailyCategoryMatrix,
  machineCategories,
  downtimeSummary,
  downtimeTrend,
  availableMinutes,
  DOWNTIME_TYPES,
  trendBuckets,
} from './reportAggregates'

// Log 1 spans two shifts (two hour groups); log 2 is one group.
const ROWS = [
  { log_id: 1, prd_no: 'PRD-002', stage_seq: 1, operation: 'Turning', machine_id: 'MC-002', machine_name: 'CNC 2',
    log_date: '2026-10-01', shift_code: 'A', planned_qty: 100, standard_qty_per_hour: 10, hour_rows: 4,
    produced: 36, rejected: 2, rework: 1, shift_hours: 8, cycle_time_min: 6 },
  { log_id: 1, prd_no: 'PRD-002', stage_seq: 1, operation: 'Turning', machine_id: 'MC-002', machine_name: 'CNC 2',
    log_date: '2026-10-02', shift_code: 'B', planned_qty: 100, standard_qty_per_hour: 10, hour_rows: 2,
    produced: 20, rejected: 0, rework: 1, shift_hours: 8, cycle_time_min: 6 },
  { log_id: 2, prd_no: 'PRD-001', stage_seq: 2, operation: 'Milling', machine_id: 'MC-001', machine_name: 'VMC 1',
    log_date: '2026-10-02', shift_code: 'A', planned_qty: 50, standard_qty_per_hour: null, hour_rows: 3,
    produced: 24, rejected: 4, rework: 0, shift_hours: null, cycle_time_min: null },
]

describe('pct', () => {
  it('is null on a zero base', () => {
    expect(pct(5, 0)).toBeNull()
    expect(pct(1, 3)).toBe(33.3)
  })
})

describe('totals', () => {
  it('weights efficiency by standard qty (sum over sum)', () => {
    const t = totals(ROWS)
    expect(t.produced).toBe(80)
    expect(t.standard).toBe(60) // log 2 has no standard -> contributes 0
    expect(t.efficiency_pct).toBe(133.3)
    expect(t.reject_pct).toBe(7.5)
    expect(t.rework_pct).toBe(2.5)
  })
  it('handles no rows', () => {
    expect(totals([])).toMatchObject({ produced: 0, efficiency_pct: null, reject_pct: null })
  })
})

describe('productionStatusRows', () => {
  it('collapses hour groups to one row per log, sorted by PRD', () => {
    const rows = productionStatusRows(ROWS)
    expect(rows.map((r) => r.log_id)).toEqual([2, 1])
    const log1 = rows[1]
    expect(log1).toMatchObject({ required_qty: 100, produced: 56, rejected: 2, rework: 2, standard: 60 })
    expect(log1.efficiency_pct).toBe(93.3)
    expect(rows[0].efficiency_pct).toBeNull()
  })
})

describe('productionStatusKpis', () => {
  it('counts planned qty once per log', () => {
    expect(productionStatusKpis(ROWS)).toMatchObject({ orders: 2, required: 150, produced: 80 })
  })
})

describe('dailyTrend / byMachine', () => {
  it('fills every day, zeros where empty', () => {
    expect(dailyTrend(ROWS, ['2026-09-30', '2026-10-01', '2026-10-02'])).toEqual([
      { date: '2026-09-30', produced: 0, standard: 0, efficiency_pct: null },
      { date: '2026-10-01', produced: 36, standard: 40, efficiency_pct: 90 },
      { date: '2026-10-02', produced: 44, standard: 20, efficiency_pct: 220 },
    ])
  })
  it('groups by machine', () => {
    const m = byMachine(ROWS)
    expect(m.map((r) => r.machine_name)).toEqual(['CNC 2', 'VMC 1'])
    expect(m[1]).toMatchObject({ rejected: 4, reject_pct: 16.7 })
  })
})

describe('searchRows', () => {
  it('matches any key, case-insensitive', () => {
    expect(searchRows(ROWS, 'milling', ['operation']).length).toBe(1)
    expect(searchRows(ROWS, '', ['operation']).length).toBe(3)
  })
})

describe('Daily Machine helpers', () => {
  it('drops manual-operation rows and labels them in byMachine', () => {
    const rows = [...ROWS, { log_id: 3, machine_id: null, machine_name: null, produced: 5, hour_rows: 1 }]
    expect(machineRows(rows).length).toBe(3)
    expect(byMachine(rows).map((r) => r.machine_name)).toContain('Manual Operations')
  })
  it('computes change vs previous', () => {
    expect(changePct(110, 100)).toBe(10)
    expect(changePct(5, 0)).toBeNull()
    expect(changePoints(92.5, 89.3)).toBe(3.2)
    expect(changePoints(null, 80)).toBeNull()
  })
  it('lists master categories in order, Uncategorised last', () => {
    expect(machineCategories([{ category: 'VMC' }, { category: null }, { category: 'CNC Turning' }, { category: 'VMC' }]))
      .toEqual(['VMC', 'CNC Turning', 'Uncategorised'])
  })
  it('builds a date x category matrix', () => {
    const rows = ROWS.map((r, i) => ({ ...r, machine_category: i === 2 ? 'VMC' : 'Cutting' }))
    const m = dailyCategoryMatrix(rows, ['2026-10-01', '2026-10-02'], ['Cutting', 'VMC'])
    expect(m[0].byCategory.Cutting.produced).toBe(36)
    expect(m[0].byCategory.VMC.produced).toBe(0)
    expect(m[1].byCategory.VMC).toMatchObject({ produced: 24, rejected: 4 })
    expect(m[1].total.produced).toBe(44)
  })
})

describe('Downtime', () => {
  const hours = [
    { machine_id: 'MC-001', log_date: '2026-10-01', hour_rows: 8, lunch: 30, opr_issue: 10, breakdown: 20, tool_issue: 0 },
    { machine_id: 'MC-002', log_date: '2026-10-02', hour_rows: 4, lunch: 0, mc_clean: 12 },
  ]
  const setup = [{ log_date: '2026-10-01', setting_time_min: 18 }]

  it('excludes lunch from available and lost', () => {
    expect(availableMinutes(hours[0])).toBe(450)
    const s = downtimeSummary(hours, setup)
    expect(s.availableMin).toBe(690)
    expect(s.lostMin).toBe(60) // 10 + 20 + 12 + 18 setting -- lunch's 30 not counted
    expect(s.downtime_pct).toBe(8.7)
    expect(s.machines).toBe(2)
    expect(DOWNTIME_TYPES.map((t) => t.key)).not.toContain('lunch')
    const setting = s.byType.find((t) => t.key === 'setting_time_min')
    expect(setting).toMatchObject({ lostMin: 18, share: 30 })
  })
  it('trends lost hours per type per day', () => {
    const t = downtimeTrend(hours, setup, ['2026-10-01', '2026-10-02'])
    expect(t[0]).toMatchObject({ setting_time_min: 0.3, breakdown: 0.3, opr_issue: 0.2 })
    expect(t[1]).toMatchObject({ mc_clean: 0.2, setting_time_min: 0 })
  })
})

describe('trendBuckets', () => {
  const daily = Array.from({ length: 70 }, (_, k) => {
    const d = new Date(2026, 7, 1 + k)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date, qty: 1, balance: k }
  })
  it('keeps daily points up to 62 days', () => {
    expect(trendBuckets(daily.slice(0, 62), { sum: ['qty'] })).toHaveLength(62)
  })
  it('rolls up to months: sums and last-day balances', () => {
    const m = trendBuckets(daily, { sum: ['qty'], last: ['balance'], monthLabel: (x) => `M${x}` })
    expect(m.map((x) => [x.date, x.qty, x.balance, x.label])).toEqual([
      ['2026-08', 31, 30, 'M2026-08'],
      ['2026-09', 30, 60, 'M2026-09'],
      ['2026-10', 9, 69, 'M2026-10'],
    ])
  })
})

describe('machineView (Daily Machine filter)', () => {
  const rows = [
    { machine_id: 'MC-1', machine_category: 'CNC', log_date: '2026-10-16', produced: 10 },
    { machine_id: 'MC-2', machine_category: 'VMC', log_date: '2026-10-16', produced: 5 },
  ]
  const categories = ['CNC', 'VMC', 'Grinding']
  const machines = [{ machine_id: 'MC-1', category: 'CNC' }, { machine_id: 'MC-2', category: 'VMC' }, { machine_id: 'MC-3', category: '' }]

  it('All (no machine) keeps every row and category', () => {
    expect(machineView(rows, categories, machines, '')).toEqual({ rows, categories })
  })
  it('a machine keeps only its rows and its category', () => {
    expect(machineView(rows, categories, machines, 'MC-2')).toEqual({ rows: [rows[1]], categories: ['VMC'] })
  })
  it('a machine with no rows still gets its (or Uncategorised) card', () => {
    expect(machineView(rows, categories, machines, 'MC-3')).toEqual({ rows: [], categories: ['Uncategorised'] })
  })
})
