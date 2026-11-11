// @vitest-environment jsdom
// Production Planning (2026-11-11):
//  - Batch rows ("Plan now") start UNticked (suggestion, Reset to suggestion,
//    + Add batch); "Tick all" ticks every row; Save with none ticked shows
//    the existing error; the summary says what stays on the line.
//  - Job Route Card opens BELOW the list and scrolls into view: row click
//    (again = close), the Route Card button, and after Save. "View" (stage
//    table) is below the list too.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  plan: vi.fn(),
  plans: [],
  none: async () => [],
}))
vi.mock('../../data/queries/productionPlanning', () => ({
  listOrdersAvailableForPlanning: async () => [
    { order_line_id: 1, parent_po_id: 7, customer_id: 'CUST-001', part_serial_number: 'PART-101', order_qty: 100, remaining_qty: 100, planned_qty: 0, prds: [] },
  ],
  listProductionPlans: async () => m.plans,
}))
vi.mock('../../data/queries/customerPoHeaders', () => ({ listPoHeaders: async () => [{ id: 7, po_number: 'PO-7' }] }))
vi.mock('../../data/queries/productionBatch', () => ({
  listProductionBatches: async () => [{ part_serial_number: 'PART-101', production_batch_quantity: 40 }],
}))
vi.mock('../../data/queries/customers', () => ({ listCustomers: m.none }))
vi.mock('../../data/queries/products', () => ({ listProducts: m.none }))
vi.mock('../../data/queries/routeCards', () => ({ planProductionOrders: (...a) => m.plan(...a), cancelProductionOrder: vi.fn() }))
vi.mock('../../data/queries/rawMaterialStock', () => ({ listRawMaterialStockBalance: async () => [{ raw_material_code: 'RM-1', current_stock: 1000 }] }))
vi.mock('../../data/queries/rawMaterials', () => ({ listRawMaterials: m.none }))
vi.mock('../../data/queries/productRawMaterials', () => ({
  listAllProductRawMaterials: async () => [{ part_serial_number: 'PART-101', raw_material_code: 'RM-1', consumption_per_unit: 1 }],
}))
vi.mock('../../data/queries/cycleTimes', () => ({ listCycleTimesForPart: async () => [{ part_serial_number: 'PART-101', seq: 10 }] }))
vi.mock('../../components/JobRouteCardSheet', () => ({
  default: ({ prdNo, onClose }) => (
    <div data-testid="route-card">
      Route card {prdNo}
      <button type="button" onClick={onClose}>Close card</button>
    </div>
  ),
}))
vi.mock('../../components/StageTraceTable', () => ({ default: ({ prdNo }) => <div data-testid="stage-table">Stages {prdNo}</div> }))
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

const scrolled = vi.fn()
beforeEach(() => {
  m.plans = [{ prd_no: 'PRD-050', customer_order_no: 'PRD-050', jc_no: 'JC-050', po_number: 'PO-7', prd_qty: 40, batch_no: 1 }]
  m.plan.mockReset().mockResolvedValue([{ prd_no: 'PRD-100' }])
  scrolled.mockReset()
  Element.prototype.scrollIntoView = scrolled
})
afterEach(() => {
  cleanup()
  delete Element.prototype.scrollIntoView
})

const ticks = () => screen.getAllByRole('checkbox', { name: /^Plan batch \d+ now$/ })
const summary = () => screen.getByTestId('batch-summary').textContent

async function pickLine() {
  render(<ProductionPlanningScreen />)
  await screen.findByRole('option', { name: 'PO-7' })
  fireEvent.change(within(screen.getByText('Customer PO No').closest('label')).getByRole('combobox'), { target: { value: '7' } })
  await waitFor(() => expect(ticks()).toHaveLength(3)) // 40 + 40 + 20
}

describe('Production Planning -- batches start unticked', () => {
  it('suggested rows, Reset to suggestion and + Add batch all start unticked; Tick all ticks every row', async () => {
    await pickLine()
    expect(ticks().map((t) => t.checked)).toEqual([false, false, false])
    expect(summary()).toContain('ticked 0 PRD(s), 0 pcs')
    expect(summary()).toContain('100 stays on the line')

    fireEvent.click(screen.getByRole('button', { name: 'Tick all' }))
    expect(ticks().map((t) => t.checked)).toEqual([true, true, true])
    expect(summary()).toContain('ticked 3 PRD(s), 100 pcs')
    expect(summary()).not.toContain('stays on the line')

    fireEvent.click(screen.getByRole('button', { name: /Add batch/ }))
    expect(ticks().map((t) => t.checked)).toEqual([true, true, true, false])

    fireEvent.click(screen.getByRole('button', { name: 'Reset to suggestion' }))
    expect(ticks().map((t) => t.checked)).toEqual([false, false, false])
  })

  it('Save with nothing ticked shows the existing error and does not plan', async () => {
    await pickLine()
    fireEvent.change(within(screen.getByText('Shift Hours').closest('label')).getByRole('spinbutton'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Tick at least one batch to plan now.')
    expect(m.plan).not.toHaveBeenCalled()
  })

  it('only the ticked batches are planned; the rest stays on the line', async () => {
    await pickLine()
    fireEvent.click(ticks()[0])
    expect(summary()).toContain('ticked 1 PRD(s), 40 pcs · 60 stays on the line')
    fireEvent.change(within(screen.getByText('Shift Hours').closest('label')).getByRole('spinbutton'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(m.plan).toHaveBeenCalledTimes(1))
    expect(m.plan.mock.calls[0][0].batches).toEqual([40])
  })
})

describe('Production Planning -- route card below the list', () => {
  const listRow = () => screen.getByText('PRD-050').closest('tr')
  const below = (el) => {
    const total = screen.getByText(/^Total Records:/)
    // the detail panel comes AFTER the list in the document
    return Boolean(total.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
  }

  it('row click opens the card below the list and scrolls to it; a second click closes it', async () => {
    render(<ProductionPlanningScreen />)
    fireEvent.click(await screen.findByText('PRD-050'))
    const card = await screen.findByTestId('route-card')
    expect(card.textContent).toContain('PRD-050')
    expect(below(card)).toBe(true)
    expect(scrolled).toHaveBeenCalled()
    fireEvent.click(screen.getByText('PRD-050'))
    expect(screen.queryByTestId('route-card')).toBeNull()
  })

  it('Route Card button opens it (does not toggle it shut via the row); ✕ closes', async () => {
    render(<ProductionPlanningScreen />)
    await screen.findByText('PRD-050')
    fireEvent.click(within(listRow()).getByRole('button', { name: /Route Card/ }))
    expect((await screen.findByTestId('route-card')).textContent).toContain('PRD-050')
    fireEvent.click(screen.getByRole('button', { name: 'Close card' }))
    expect(screen.queryByTestId('route-card')).toBeNull()
  })

  it('View opens the stage table below the list (row click not triggered)', async () => {
    render(<ProductionPlanningScreen />)
    await screen.findByText('PRD-050')
    fireEvent.click(within(listRow()).getByRole('button', { name: /View/ }))
    const table = await screen.findByTestId('stage-table')
    expect(below(table)).toBe(true)
    expect(screen.queryByTestId('route-card')).toBeNull()
  })

  it("after Save the new PRD's card opens below the list", async () => {
    await pickLine()
    fireEvent.click(screen.getByRole('button', { name: 'Tick all' }))
    fireEvent.change(within(screen.getByText('Shift Hours').closest('label')).getByRole('spinbutton'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    const card = await screen.findByTestId('route-card')
    expect(card.textContent).toContain('PRD-100')
    expect(below(card)).toBe(true)
    expect(scrolled).toHaveBeenCalled()
  })
})
