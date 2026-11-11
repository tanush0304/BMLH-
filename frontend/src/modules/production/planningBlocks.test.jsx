// @vitest-environment jsdom
// Production Planning save blocks, both checked before the planning RPC:
// a part with no Cycle Time Master rows (no route), and RM stock short for
// the batches planned now; a part with no BOM (after the route check);
// Labour orders skip the BOM + stock checks.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
// The screen's migration probes (043 open PO, 042 delivery addresses) are
// mocked: unmocked they made real network calls to Supabase, which is what
// made this file flaky under full-suite load (refresh waited on the probe).
// No real Supabase client at all: any query left unmocked fails fast instead
// of going to the network.
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../components/JobRouteCardSheet', () => ({ default: () => null }))
vi.mock('../../components/StageTraceTable', () => ({ default: () => null }))
vi.mock('../../data/queries/openPo', () => ({ openPoSupported: async () => false, listLineStatuses: async () => [] }))
vi.mock('../../data/queries/deliveryAddresses', () => ({ deliveryAddressesSupported: async () => false, listDeliveryAddresses: async () => [] }))

const m = vi.hoisted(() => ({
  plan: vi.fn(),
  route: vi.fn(),
  balance: vi.fn(),
  bom: vi.fn(),
  orderType: null,
  none: async () => [],
}))
vi.mock('../../data/queries/productionPlanning', () => ({
  listOrdersAvailableForPlanning: async () => [
    { order_line_id: 1, parent_po_id: 7, customer_id: 'CUST-001', part_serial_number: 'PART-101', order_qty: 100, remaining_qty: 100, planned_qty: 0, prds: [], order_type: m.orderType },
  ],
  listProductionPlans: m.none,
}))
vi.mock('../../data/queries/customerPoHeaders', () => ({ listPoHeaders: async () => [{ id: 7, po_number: 'PO-7' }] }))
vi.mock('../../data/queries/productionBatch', () => ({ listProductionBatches: m.none }))
vi.mock('../../data/queries/customers', () => ({ listCustomers: m.none }))
vi.mock('../../data/queries/products', () => ({ listProducts: m.none }))
vi.mock('../../data/queries/routeCards', () => ({ planProductionOrders: (...a) => m.plan(...a), cancelProductionOrder: vi.fn() }))
vi.mock('../../data/queries/rawMaterialStock', () => ({ listRawMaterialStockBalance: (...a) => m.balance(...a) }))
vi.mock('../../data/queries/rawMaterials', () => ({ listRawMaterials: m.none }))
vi.mock('../../data/queries/productRawMaterials', () => ({ listAllProductRawMaterials: (...a) => m.bom(...a) }))
vi.mock('../../data/queries/cycleTimes', () => ({ listCycleTimesForPart: (...a) => m.route(...a) }))
// Native select in place of the searchable one, so the test can pick values.
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options, disabled }) => (
    <select value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {(options ?? []).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}))

import ProductionPlanningScreen from './ProductionPlanningScreen'

beforeEach(() => {
  m.orderType = null
  m.plan.mockReset().mockResolvedValue([{ prd_no: 'PRD-100' }])
  m.route.mockReset().mockResolvedValue([{ part_serial_number: 'PART-101', seq: 10, machine_id: 'MC-01' }])
  m.balance.mockReset().mockResolvedValue([{ raw_material_code: 'RM-1', current_stock: 1000 }])
  m.bom.mockReset().mockResolvedValue([{ part_serial_number: 'PART-101', raw_material_code: 'RM-1', consumption_per_unit: 2 }])
})
afterEach(() => cleanup())

async function fillAndSave() {
  render(<ProductionPlanningScreen />)
  const po = within(screen.getByText('Customer PO No').closest('label')).getByRole('combobox')
  await screen.findByRole('option', { name: 'PO-7' })
  fireEvent.change(po, { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tick all' })) // batches start unticked
  fireEvent.change(within(screen.getByText('Shift Hours').closest('label')).getByRole('spinbutton'), { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
}

describe('Production Planning blocks', () => {
  it('a part with no Cycle Time Master rows is refused before the planning RPC', async () => {
    m.route.mockResolvedValue([])
    await fillAndSave()
    expect(await screen.findByText('PART-101 has no route in Cycle Time Master -- add its stages first.')).toBeTruthy()
    expect(m.route).toHaveBeenCalledWith('PART-101')
    expect(m.plan).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').closest('[data-testid="toast"]')).toBeTruthy()
    expect(screen.getByText('Part (PO line)').closest('label').hasAttribute('data-invalid')).toBe(true)
  })

  it('blank Shift Hours: toast + Shift Hours highlighted and focused, no DB call', async () => {
    render(<ProductionPlanningScreen />)
    await screen.findByRole('option', { name: 'PO-7' })
    fireEvent.change(within(screen.getByText('Customer PO No').closest('label')).getByRole('combobox'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tick all' }))
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Shift Hours')
    const field = screen.getByText('Shift Hours').closest('label')
    expect(field.hasAttribute('data-invalid')).toBe(true)
    await vi.waitFor(() => expect(document.activeElement).toBe(within(field).getByRole('spinbutton')))
    expect(m.route).not.toHaveBeenCalled()
  })

  it('a bad batch qty cell is red with no inline text list; the message comes in the toast on Save', async () => {
    render(<ProductionPlanningScreen />)
    await screen.findByRole('option', { name: 'PO-7' })
    fireEvent.change(within(screen.getByText('Customer PO No').closest('label')).getByRole('combobox'), { target: { value: '7' } })
    const qty = screen.getByRole('spinbutton', { name: 'Batch 1 qty' })
    fireEvent.change(qty, { target: { value: '0' } })
    expect(qty.hasAttribute('data-invalid')).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/Every batch qty must be greater than 0/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Every batch qty must be greater than 0')
  })

  it('RM stock short for the planned batches is refused before the planning RPC', async () => {
    m.balance.mockResolvedValue([{ raw_material_code: 'RM-1', current_stock: 150 }]) // needs 200
    await fillAndSave()
    expect(await screen.findByText('Cannot save -- insufficient raw material stock: RM-1 short by 50.')).toBeTruthy()
    expect(m.plan).not.toHaveBeenCalled()
  })

  it('a part with no BOM rows is refused after the route check, before the RM stock check and the RPC', async () => {
    m.bom.mockResolvedValue([])
    await fillAndSave()
    expect(await screen.findByText('PART-101 has no BOM (consumption per unit) in Product Master -- add it before planning.')).toBeTruthy()
    expect(m.route).toHaveBeenCalledWith('PART-101')
    expect(m.balance).toHaveBeenCalledTimes(1) // screen load only, no save-time stock read
    expect(m.plan).not.toHaveBeenCalled()
    expect(screen.getByText('Part (PO line)').closest('label').hasAttribute('data-invalid')).toBe(true)
  })

  it('the route check still comes first when there is no BOM either', async () => {
    m.route.mockResolvedValue([])
    m.bom.mockResolvedValue([])
    await fillAndSave()
    expect(await screen.findByText('PART-101 has no route in Cycle Time Master -- add its stages first.')).toBeTruthy()
  })

  it('Labour order: no BOM needed, RM stock not checked, info note shown', async () => {
    m.orderType = ' labour '
    m.bom.mockResolvedValue([])
    let stockReadsAtPlan = null
    m.plan.mockImplementation(async () => {
      stockReadsAtPlan = m.balance.mock.calls.length
      return [{ prd_no: 'PRD-100' }]
    })
    await fillAndSave()
    expect(screen.getByText('Labour order: no RM stock check')).toBeTruthy()
    await vi.waitFor(() => expect(m.plan).toHaveBeenCalledTimes(1))
    expect(stockReadsAtPlan).toBe(1) // screen load only, no save-time stock read
  })

  it('Labour order with a BOM and short stock still plans (stock check skipped)', async () => {
    m.orderType = 'Labour'
    m.balance.mockResolvedValue([{ raw_material_code: 'RM-1', current_stock: 0 }])
    await fillAndSave()
    await vi.waitFor(() => expect(m.plan).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/insufficient raw material stock/)).toBeNull()
  })

  it('Manufacturing order shows no Labour note', async () => {
    m.orderType = 'Manufacturing'
    await fillAndSave()
    await vi.waitFor(() => expect(m.plan).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Labour order: no RM stock check')).toBeNull()
  })

  it('plans when the route exists and stock covers the batches', async () => {
    await fillAndSave()
    await vi.waitFor(() => expect(m.plan).toHaveBeenCalledTimes(1))
  })
})
