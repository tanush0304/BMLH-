// @vitest-environment jsdom
// Production Planning after 043: only Open lines of Open POs are offered
// (Closed by despatch / Cancelled / PO Closed left out); a PO past Valid To
// shows an amber note but can still be planned. Before 043: unchanged.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

const m = vi.hoisted(() => ({
  supported: true,
  none: async () => [],
}))
// No real Supabase client: tests never reach the network (src/test/noNetwork.js).
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../data/queries/deliveryAddresses', () => ({ deliveryAddressesSupported: async () => false, listDeliveryAddresses: async () => [] }))
vi.mock('../../data/queries/productionPlanning', () => ({
  listOrdersAvailableForPlanning: async () => [
    { order_line_id: 1, parent_po_id: 7, customer_id: 'C', part_serial_number: 'P-OPEN', order_qty: 100, remaining_qty: 100, planned_qty: 0, prds: [] },
    { order_line_id: 2, parent_po_id: 7, customer_id: 'C', part_serial_number: 'P-CLOSED', order_qty: 100, remaining_qty: 50, planned_qty: 50, prds: [] },
    { order_line_id: 3, parent_po_id: 7, customer_id: 'C', part_serial_number: 'P-CANCEL', order_qty: 100, remaining_qty: 100, planned_qty: 0, prds: [] },
    { order_line_id: 4, parent_po_id: 8, customer_id: 'C', part_serial_number: 'P-POCLOSED', order_qty: 100, remaining_qty: 100, planned_qty: 0, prds: [] },
  ],
  listProductionPlans: m.none,
}))
vi.mock('../../data/queries/customerPoHeaders', () => ({
  listPoHeaders: async () => [
    { id: 7, po_number: 'PO-ANNUAL', po_status: 'Open', valid_to: '2020-03-31' },
    { id: 8, po_number: 'PO-SHUT', po_status: 'Closed' },
  ],
}))
vi.mock('../../data/queries/openPo', () => ({
  openPoSupported: async () => m.supported,
  listLineStatuses: async () => [
    { order_line_id: 1, line_status: 'Open' },
    { order_line_id: 2, line_status: 'Closed' },
    { order_line_id: 3, line_status: 'Cancelled' },
    { order_line_id: 4, line_status: 'Open' },
  ],
}))
vi.mock('../../data/queries/productionBatch', () => ({ listProductionBatches: m.none }))
vi.mock('../../data/queries/customers', () => ({ listCustomers: m.none }))
vi.mock('../../data/queries/products', () => ({ listProducts: m.none }))
vi.mock('../../data/queries/routeCards', () => ({ planProductionOrders: vi.fn(), cancelProductionOrder: vi.fn() }))
vi.mock('../../data/queries/rawMaterialStock', () => ({ listRawMaterialStockBalance: m.none }))
vi.mock('../../data/queries/rawMaterials', () => ({ listRawMaterials: m.none }))
vi.mock('../../data/queries/productRawMaterials', () => ({ listAllProductRawMaterials: m.none }))
vi.mock('../../data/queries/cycleTimes', () => ({ listCycleTimesForPart: m.none }))
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
  m.supported = true
})
afterEach(() => cleanup())

const select = (label) => within(screen.getByText(label).closest('label')).getByRole('combobox')

describe('Production Planning -- open PO filter', () => {
  it('offers only Open lines of Open POs, with an amber note for an expired PO', async () => {
    render(<ProductionPlanningScreen />)
    await screen.findByRole('option', { name: 'PO-ANNUAL' })
    expect(screen.queryByRole('option', { name: 'PO-SHUT' })).toBeNull()
    fireEvent.change(select('Customer PO No'), { target: { value: '7' } })
    const parts = within(select('Part (PO line)')).getAllByRole('option').map((o) => o.textContent)
    expect(parts.some((t) => t.startsWith('P-OPEN'))).toBe(true)
    expect(parts.some((t) => t.startsWith('P-CLOSED'))).toBe(false)
    expect(parts.some((t) => t.startsWith('P-CANCEL'))).toBe(false)
    expect(await screen.findByText(/PO PO-ANNUAL validity ended on 2020-03-31 -- planning is still allowed/)).toBeTruthy()
  })

  it('before 043: every line offered as today', async () => {
    m.supported = false
    render(<ProductionPlanningScreen />)
    await screen.findByRole('option', { name: 'PO-SHUT' })
    fireEvent.change(select('Customer PO No'), { target: { value: '7' } })
    const parts = within(select('Part (PO line)')).getAllByRole('option').map((o) => o.textContent)
    expect(parts.filter((t) => t.startsWith('P-')).length).toBe(3)
  })
})
