// @vitest-environment jsdom
// Production Status KPI card 2: PRD only -> last-stage good qty to date (as
// before); PRD + Machine / Shift / Operator -> good qty (produced - rejected -
// rework) of the same filtered rows + period as the other cards.
import { cloneElement } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { filteredGoodKpiSub } from '../../utils/reportAggregates'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 300 }) }
})
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../components/reports/ReportFilterBar', () => ({ default: () => null }))

let applied
vi.mock('../../components/reports/useReportPeriod', () => ({
  default: () => ({ applied, filters: applied, setFilter: () => () => {}, barProps: {} }),
}))

let hourRows
const listProductionHours = vi.fn(async () => hourRows)
vi.mock('../../data/queries/reports', () => ({
  listProductionHours: (...a) => listProductionHours(...a),
  listLoggedPrds: async () => ['PRD-1'],
}))
vi.mock('../../data/queries/machines', () => ({
  listMachines: async () => [{ machine_id: 'MC-2', machine_name: 'CNC 2', category: 'CNC' }],
}))
vi.mock('../../data/queries/shifts', () => ({ listShifts: async () => [{ shift_code: 'SHIFT-A' }] }))
vi.mock('../../data/queries/employees', () => ({ listEmployees: async () => [{ employee_id: 'E1', employee_name: 'Ravi' }] }))
vi.mock('../../data/queries/customerOrders', () => ({ listOrdersByPrd: async () => [{ prd_no: 'PRD-1', prd_qty: 500, order_qty: 1000 }] }))
vi.mock('../../data/queries/routeCards', () => ({ getStagesForPrd: async () => [{ id: 11, seq: 1 }, { id: 12, seq: 2 }] }))
// Last stage (id 12) accepted to date = 777 -- deliberately unlike the hour rows.
vi.mock('../../data/queries/productionLogs', () => ({ getStageAggregatesForPrd: async () => ({ 11: { accepted: 900 }, 12: { output: 800, accepted: 777 } }) }))

import ProductionStatusScreen from './ProductionStatusScreen'

const BASE = { from: '2026-11-01', to: '2026-11-24', prdNo: 'PRD-1', machineId: '', shiftCode: '', employeeId: '' }
const row = (log_id, produced, rejected, rework, extra = {}) => ({
  log_id, log_date: '2026-11-20', shift_code: 'SHIFT-A', employee_id: 'E1', prd_no: 'PRD-1', stage_id: 11, stage_seq: 1, operation: 'Turning',
  machine_id: 'MC-2', machine_name: 'CNC 2', hour_rows: 1, produced, rejected, rework, planned_qty: 100, cycle_time_min: 1, standard_qty_per_hour: 60, ...extra,
})
// Good = (50-2-1) + (30-0-3) = 74
const ROWS = [row(1, 50, 2, 1), row(2, 30, 0, 3)]

function card2() {
  const label = screen.queryByText('Good Qty Produced') ?? screen.getByText('Qty Produced (last stage good)')
  return label.closest('.rounded-xl')
}

beforeEach(() => {
  listProductionHours.mockClear()
  hourRows = ROWS
})
afterEach(cleanup)

describe('filteredGoodKpiSub', () => {
  it('joins filter labels and adds this period', () => {
    expect(filteredGoodKpiSub(['CNC 2'])).toBe('CNC 2 · this period')
    expect(filteredGoodKpiSub(['CNC 2', null, 'Ravi (E1)'])).toBe('CNC 2 · Ravi (E1) · this period')
    expect(filteredGoodKpiSub([])).toBe('this period')
  })
})

describe('Production Status card 2', () => {
  it('PRD only: last-stage good qty to date, unchanged', async () => {
    applied = { ...BASE }
    render(<ProductionStatusScreen />)
    await waitFor(() => expect(card2().textContent).toContain('777'))
    expect(screen.getByText('Qty Produced (last stage good)')).toBeTruthy()
    expect(card2().textContent).toContain('to date')
    expect(screen.queryByText('Good Qty Produced')).toBeNull()
  })

  const cases = [
    ['machine', { machineId: 'MC-2' }, /CNC 2.*· this period/],
    ['shift', { shiftCode: 'SHIFT-A' }, /^SHIFT-A · this period$/],
    ['operator', { employeeId: 'E1' }, /Ravi.* · this period$/],
    ['combined', { machineId: 'MC-2', shiftCode: 'SHIFT-A', employeeId: 'E1' }, /CNC 2.* · SHIFT-A · Ravi.* · this period$/],
  ]
  for (const [name, f, sub] of cases) {
    it(`PRD + ${name}: good qty of the filtered rows this period`, async () => {
      applied = { ...BASE, ...f }
      render(<ProductionStatusScreen />)
      await waitFor(() => expect(card2().textContent).toContain('74'))
      expect(screen.getByText('Good Qty Produced')).toBeTruthy()
      expect(card2().textContent).not.toContain('777')
      await waitFor(() => expect(screen.getByText(sub)).toBeTruthy())
      expect(listProductionHours).toHaveBeenCalledWith(expect.objectContaining({ prdNo: 'PRD-1', ...f }))
    })
  }

  it('filter with no rows gives 0', async () => {
    hourRows = []
    applied = { ...BASE, machineId: 'MC-2' }
    render(<ProductionStatusScreen />)
    await waitFor(() => expect(screen.getByText('Good Qty Produced')).toBeTruthy())
    await waitFor(() => expect(card2().querySelector('.text-\\[26px\\]').textContent).toBe('0'))
  })
})
