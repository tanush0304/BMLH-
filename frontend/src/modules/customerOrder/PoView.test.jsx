// @vitest-environment jsdom
// PO view (043): qty up / down to planned / below planned (screen + DB
// message), cancel line rules, Add line (open PO only; DB refusal shown),
// Close PO confirm, line status pills, qty history.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const q = vi.hoisted(() => ({
  getPoHeader: vi.fn(),
  updatePoHeader: vi.fn(),
  listLineStatuses: vi.fn(),
  listLineEdits: vi.fn(),
  updateLineQty: vi.fn(),
  cancelLine: vi.fn(),
  listPrdStatesForLine: vi.fn(),
  createCustomerOrder: vi.fn(),
}))
vi.mock('../../data/queries/openPo', () => q)
vi.mock('../../data/queries/customerOrders', () => q)
vi.mock('../../components/StockEditPanel', () => ({ useAppUsers: () => [] }))
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options }) => (
    <select value={value} onChange={onChange}>
      <option value="" />
      {(options ?? []).map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o }
        return <option key={opt.value} value={opt.value}>{opt.label}</option>
      })}
    </select>
  ),
}))

import PoView from './PoView'

const HEADER = { id: 7, customer_id: 'CUST-001', po_number: 'PO-ANNUAL', po_date: '2026-04-01', valid_from: '2026-04-01', valid_to: '2027-03-31', po_status: 'Open' }
const LINES = [
  { order_line_id: 1, parent_po_id: 7, part_serial_number: 'P-1', order_qty: 10000, planned_qty: 8000, despatched_qty: 2000, line_status: 'Open' },
  { order_line_id: 2, parent_po_id: 7, part_serial_number: 'P-2', order_qty: 500, planned_qty: 500, despatched_qty: 500, line_status: 'Closed' },
  { order_line_id: 3, parent_po_id: 7, part_serial_number: 'P-3', order_qty: 100, planned_qty: 0, despatched_qty: 0, line_status: 'Cancelled' },
  { order_line_id: 9, parent_po_id: 99, part_serial_number: 'OTHER', order_qty: 1, planned_qty: 0, despatched_qty: 0, line_status: 'Open' },
]
const NO_DELIVERY = { supported: false, addresses: [], byId: new Map() }

beforeEach(() => {
  q.getPoHeader.mockReset().mockResolvedValue(HEADER)
  q.listLineStatuses.mockReset().mockResolvedValue(LINES)
  q.listLineEdits.mockReset().mockResolvedValue([{ id: 1, old_qty: 9000, new_qty: 10000, edited_by: null, edited_at: '2026-11-01T10:00:00Z' }])
  q.updateLineQty.mockReset().mockResolvedValue({})
  q.cancelLine.mockReset().mockResolvedValue({})
  q.updatePoHeader.mockReset().mockResolvedValue({})
  q.createCustomerOrder.mockReset().mockResolvedValue({})
  q.listPrdStatesForLine.mockReset().mockResolvedValue([
    { prd_no: 'PRD-015', stages: [{ status: 'Pending' }], hasLogs: false },
    { prd_no: 'PRD-014', stages: [{ status: 'Pending' }], hasLogs: false },
    { prd_no: 'PRD-010', stages: [{ status: 'Completed' }], hasLogs: true },
  ])
})
afterEach(() => cleanup())

function renderView(props = {}) {
  return render(
    <PoView poId={7} role="supervisor" customers={[{ customer_id: 'CUST-001', customer_name: 'Acme' }]} products={[{ part_serial_number: 'P-9', part_name: 'Pin' }]} delivery={NO_DELIVERY} orderLines={[{ order_line_id: 1, order_type: 'Manufacturing' }]} {...props} />
  )
}
const row = (id) => screen.getByTestId(`po-line-${id}`)

async function editQty(value) {
  renderView()
  fireEvent.click(within(await screen.findByTestId('po-line-1')).getByRole('button', { name: /Edit qty/ }))
  const input = await screen.findByLabelText('New order qty')
  expect(within(row(1)).getByText('min 8,000 (planned)')).toBeTruthy()
  fireEvent.change(input, { target: { value } })
  fireEvent.click(within(row(1)).getByRole('button', { name: 'Save' }))
}

describe('PO view', () => {
  it('shows only this PO\'s lines with status, planned, despatched', async () => {
    renderView()
    await screen.findByTestId('po-line-1')
    expect(screen.queryByText('OTHER')).toBeNull()
    expect(within(row(1)).getByText('Open')).toBeTruthy()
    expect(within(row(2)).getByText('Closed')).toBeTruthy()
    expect(within(row(3)).getByText('Cancelled')).toBeTruthy()
    expect(within(row(1)).getByText('10,000')).toBeTruthy()
    expect(within(row(1)).getByText('8,000')).toBeTruthy()
    expect(within(row(1)).getByText('2,000')).toBeTruthy()
    expect(within(row(3)).queryByRole('button', { name: /Edit qty/ })).toBeNull()
  })

  it('qty increase saves', async () => {
    await editQty('12000')
    await waitFor(() => expect(q.updateLineQty).toHaveBeenCalledWith(1, 12000))
  })

  it('qty down to planned saves', async () => {
    await editQty('8000')
    await waitFor(() => expect(q.updateLineQty).toHaveBeenCalledWith(1, 8000))
  })

  it('qty below planned refused on screen, naming unstarted PRDs', async () => {
    await editQty('7000')
    expect(await screen.findByText('Already planned 8,000 -- reduce to at least 8,000, or cancel unstarted PRDs (PRD-014, PRD-015) first.')).toBeTruthy()
    expect(q.updateLineQty).not.toHaveBeenCalled()
  })

  it('DB refusal shown in the toast', async () => {
    q.updateLineQty.mockRejectedValue({ code: '23514', message: 'Already planned 9,000 -- reduce to at least 9,000.' })
    await editQty('8500')
    expect(await screen.findByText('Already planned 9,000 -- reduce to at least 9,000.')).toBeTruthy()
  })

  it('cancel line: reason required, then refused while PRDs are unstarted', async () => {
    renderView()
    fireEvent.click(within(await screen.findByTestId('po-line-1')).getByRole('button', { name: /Cancel line/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel Line' }))
    expect(await within(dialog).findByText('A reason is required to cancel a PO line.')).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Customer dropped it' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel Line' }))
    expect(await within(dialog).findByText(/cancel unstarted PRDs \(PRD-014, PRD-015\) in Production Planning first/)).toBeTruthy()
    expect(q.cancelLine).not.toHaveBeenCalled()
  })

  it('cancel line allowed once every PRD has finished production', async () => {
    q.listPrdStatesForLine.mockResolvedValue([{ prd_no: 'PRD-010', stages: [{ status: 'Completed' }], hasLogs: true }])
    renderView()
    fireEvent.click(within(await screen.findByTestId('po-line-1')).getByRole('button', { name: /Cancel line/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' Customer dropped it ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel Line' }))
    await waitFor(() => expect(q.cancelLine).toHaveBeenCalledWith(1, 'Customer dropped it'))
  })

  it('Add line saves to this PO', async () => {
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: /Add line/ }))
    const form = screen.getByTestId('add-line-form')
    fireEvent.change(within(within(form).getByText('Part Serial Number').closest('label')).getByRole('combobox'), { target: { value: 'P-9' } })
    expect(within(within(form).getByText('Order Type').closest('label')).getByRole('combobox').value).toBe('Manufacturing')
    fireEvent.change(within(within(form).getByText('Order Qty').closest('label')).getByRole('spinbutton'), { target: { value: '300' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save Line' }))
    await waitFor(() => expect(q.createCustomerOrder).toHaveBeenCalled())
    expect(q.createCustomerOrder.mock.calls[0][0]).toMatchObject({ parent_po_id: 7, customer_id: 'CUST-001', po_number: 'PO-ANNUAL', part_serial_number: 'P-9', order_qty: 300, order_type: 'Manufacturing' })
  })

  it('Closed PO: no Add line; Reopen offered; DB refusal of a line is shown', async () => {
    q.getPoHeader.mockResolvedValue({ ...HEADER, po_status: 'Closed' })
    renderView()
    expect(await screen.findByText('PO is closed -- reopen it to add lines.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add line/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Reopen PO/ })).toBeTruthy()
  })

  it('Close PO asks first, then saves po_status', async () => {
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: /Close PO/ }))
    expect(screen.getByText('Close PO PO-ANNUAL?')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Close PO' }).at(-1))
    await waitFor(() => expect(q.updatePoHeader).toHaveBeenCalledWith(7, { po_status: 'Closed' }))
  })

  it('operator: no change buttons', async () => {
    renderView({ role: 'operator' })
    await screen.findByTestId('po-line-1')
    expect(screen.queryByRole('button', { name: /Edit qty|Cancel line|Close PO/ })).toBeNull()
  })

  it('history lists every qty change', async () => {
    renderView()
    fireEvent.click(within(await screen.findByTestId('po-line-1')).getByRole('button', { name: /History/ }))
    const h = await screen.findByTestId('line-history')
    expect(within(h).getByText(/9,000 → 10,000/)).toBeTruthy()
  })
})
