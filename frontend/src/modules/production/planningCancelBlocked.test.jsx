// @vitest-environment jsdom
// Production Planning: listProductionPlans flags PRDs that have production
// logs (one read of "production logs".prd_no); a cancellable-by-stages PRD
// with logs shows Cancel disabled with a tooltip and never calls cancel.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react'

const logsRead = vi.fn()
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: (table) => ({
      select: (cols) => ({
        in: (col, values) => ({
          range: async () => {
            logsRead({ table, cols, col, values })
            return { data: [{ prd_no: 'PRD-002' }, { prd_no: 'PRD-002' }], error: null }
          },
        }),
      }),
    }),
  },
}))

const CARDS = [{ jc_no: 'JC-001', prd_no: 'PRD-001' }, { jc_no: 'JC-002', prd_no: 'PRD-002' }, { jc_no: 'JC-003', prd_no: 'PRD-003' }]
const STAGES = [
  { id: 1, prd_no: 'PRD-001', seq: 10, status: 'Pending' },
  { id: 2, prd_no: 'PRD-002', seq: 10, status: 'Pending' },
  { id: 3, prd_no: 'PRD-003', seq: 10, status: 'Completed' },
]
vi.mock('../../data/queries/routeCards', () => ({
  listRouteCards: vi.fn(async () => CARDS),
  listAllStages: vi.fn(async () => STAGES),
  planProductionOrders: vi.fn(),
  cancelProductionOrder: vi.fn(),
}))
vi.mock('../../data/queries/customerOrders', () => ({
  listCustomerOrders: vi.fn(async () => [{ order_line_id: 1, customer_id: 'C1', po_number: 'PO-1', part_serial_number: 'P1', order_qty: 300 }]),
  listProductionOrders: vi.fn(async () => CARDS.map((c, i) => ({ prd_no: c.prd_no, order_line_id: 1, batch_no: i + 1, prd_qty: 100 }))),
  listProductionOrderCancellations: vi.fn(async () => []),
  joinPrdsToLines: (prds, lines) => prds.map((p) => ({ ...lines[0], ...p, batch_count: 3, cancelled_count: 0, planned_qty: 300 })),
}))
vi.mock('../../data/queries/customers', () => ({ listCustomers: vi.fn(async () => [{ customer_id: 'C1', customer_name: 'Acme' }]) }))
vi.mock('../../data/queries/products', () => ({ listProducts: vi.fn(async () => [{ part_serial_number: 'P1', part_name: 'Shaft' }]) }))
vi.mock('../../data/queries/productionBatch', () => ({ listProductionBatches: vi.fn(async () => []) }))
vi.mock('../../data/queries/customerPoHeaders', () => ({ listPoHeaders: vi.fn(async () => []) }))
vi.mock('../../data/queries/rawMaterialStock', () => ({ listRawMaterialStockBalance: vi.fn(async () => []) }))
vi.mock('../../data/queries/rawMaterials', () => ({ listRawMaterials: vi.fn(async () => []) }))
vi.mock('../../data/queries/productRawMaterials', () => ({ listAllProductRawMaterials: vi.fn(async () => []) }))

const { listProductionPlans } = await import('../../data/queries/productionPlanning')
const { cancelProductionOrder } = await import('../../data/queries/routeCards')
const { default: ProductionPlanningScreen, CANCEL_BLOCKED } = await import('./ProductionPlanningScreen')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('listProductionPlans: has_production_logs', () => {
  it('one read of production logs (prd_no, listed PRDs) sets the flag per row', async () => {
    const rows = await listProductionPlans()
    expect(logsRead).toHaveBeenCalledTimes(1)
    expect(logsRead).toHaveBeenCalledWith({ table: 'production logs', cols: 'prd_no', col: 'prd_no', values: ['PRD-001', 'PRD-002', 'PRD-003'] })
    expect(rows.map((r) => [r.prd_no, r.can_cancel, r.has_production_logs])).toEqual([
      ['PRD-001', true, false],
      ['PRD-002', true, true],
      ['PRD-003', false, false],
    ])
  })
})

describe('Production Planning list: Cancel', () => {
  it('PRD with logs: Cancel disabled with the tooltip, click does nothing; PRD without logs: Cancel enabled', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('x')
    await act(async () => { render(<ProductionPlanningScreen role="supervisor" />) })
    const more = screen.queryByRole('button', { name: /View More/ })
    if (more) fireEvent.click(more)

    const row2 = screen.getAllByRole('row').find((r) => within(r).queryByText('PRD-002'))
    const blocked = within(row2).getByRole('button', { name: CANCEL_BLOCKED })
    expect(CANCEL_BLOCKED).toBe("Production has started -- can't cancel")
    expect(blocked.disabled).toBe(true)
    expect(blocked.getAttribute('title')).toBe(CANCEL_BLOCKED)
    expect(blocked.className).toContain('cursor-not-allowed')
    fireEvent.click(blocked)
    expect(prompt).not.toHaveBeenCalled()
    expect(cancelProductionOrder).not.toHaveBeenCalled()

    const row1 = screen.getAllByRole('row').find((r) => within(r).queryByText('PRD-001'))
    const enabled = within(row1).getByRole('button', { name: /Cancel/ })
    expect(enabled.disabled).toBe(false)
    const row3 = screen.getAllByRole('row').find((r) => within(r).queryByText('PRD-003'))
    expect(within(row3).queryByRole('button', { name: /Cancel/ })).toBeNull()
    prompt.mockRestore()
  })
})
