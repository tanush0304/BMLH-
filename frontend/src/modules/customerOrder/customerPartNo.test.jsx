// @vitest-environment jsdom
// New Order (045): Customer Part No + Customer Drawing Ref are read-only,
// looked up by customer + part (never saved on the line); "—" when there is
// no row; hidden before 045. List column too.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const q = vi.hoisted(() => ({
  listCustomerOrders: vi.fn(),
  createCustomerOrder: vi.fn(),
  updateCustomerOrder: vi.fn(),
  deleteCustomerOrder: vi.fn(),
  listProductionOrders: vi.fn(),
  listPoHeaders: vi.fn(),
  createPoHeader: vi.fn(),
  listCustomerEnquiries: vi.fn(),
  listCustomers: vi.fn(),
  listProducts: vi.fn(),
  resolveProductWithConfirmation: vi.fn(),
  deliveryAddressesSupported: vi.fn(),
  listDeliveryAddresses: vi.fn(),
  customerPartNumbersSupported: vi.fn(),
  listCustomerPartNumbers: vi.fn(),
}))
vi.mock('../../data/queries/customerOrders', () => q)
vi.mock('../../data/queries/customerPoHeaders', () => q)
vi.mock('../../data/queries/customerEnquiries', () => q)
vi.mock('../../data/queries/customers', () => q)
vi.mock('../../data/queries/products', () => q)
vi.mock('../../data/queries/deliveryAddresses', () => q)
vi.mock('../../data/queries/customerPartNumbers', () => q)
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options, disabled }) => (
    <select value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {(options ?? []).map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o }
        return <option key={opt.value} value={opt.value}>{opt.label}</option>
      })}
    </select>
  ),
}))

import CustomerOrderScreen from './CustomerOrderScreen'

beforeEach(() => {
  q.listCustomerOrders.mockReset().mockResolvedValue([
    { order_line_id: 7, customer_id: 'CUST-001', po_number: 'PO-1', po_date: '2026-11-01', part_serial_number: 'P-1', order_qty: 10, order_type: 'Labour' },
  ])
  q.listProductionOrders.mockReset().mockResolvedValue([])
  q.listPoHeaders.mockReset().mockResolvedValue([])
  q.createPoHeader.mockReset().mockResolvedValue({ id: 55 })
  q.listCustomerEnquiries.mockReset().mockResolvedValue([])
  q.listCustomers.mockReset().mockResolvedValue([
    { customer_id: 'CUST-001', customer_name: 'Acme' },
    { customer_id: 'CUST-002', customer_name: 'Bolt' },
  ])
  q.listProducts.mockReset().mockResolvedValue([
    { part_serial_number: 'P-1', part_name: 'Shaft' },
    { part_serial_number: 'P-2', part_name: 'Gear' },
  ])
  q.resolveProductWithConfirmation.mockReset().mockImplementation(async (p) => ({ partSerialNumber: p.partSerialNumber, knownProducts: p.knownProducts }))
  q.createCustomerOrder.mockReset().mockImplementation(async (p) => ({ order_line_id: 99, ...p }))
  q.deliveryAddressesSupported.mockReset().mockResolvedValue(false)
  q.listDeliveryAddresses.mockReset().mockResolvedValue([])
  q.customerPartNumbersSupported.mockReset().mockResolvedValue(true)
  q.listCustomerPartNumbers.mockReset().mockResolvedValue([
    { id: 1, customer_id: 'CUST-001', part_serial_number: 'P-1', customer_part_number: 'ACME-77', customer_drawing_ref: 'AD-9', revision: 'B', is_active: true },
  ])
})
afterEach(() => cleanup())

const control = (label) => within(screen.getAllByText(label, { selector: 'span' })[0].closest('label')).getByRole('combobox')
const box = (label) => screen.getAllByText(label, { selector: 'span' })[0].closest('label')

describe('New Order -- Customer Part No (045)', () => {
  it('filled in, read-only, after customer + part; "—" with no row', async () => {
    render(<CustomerOrderScreen />)
    await screen.findByText('PO-1')
    await waitFor(() => expect(q.listCustomerPartNumbers).toHaveBeenCalled())
    expect(within(box('Customer Part No')).queryByRole('textbox')).toBeNull()
    expect(box('Customer Part No').textContent).toContain('—')

    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    fireEvent.change(control('Part Serial Number'), { target: { value: 'P-1' } })
    await waitFor(() => expect(box('Customer Part No').textContent).toContain('ACME-77'))
    expect(box('Customer Drawing Ref').textContent).toContain('AD-9 Rev B')

    fireEvent.change(control('Part Serial Number'), { target: { value: 'P-2' } })
    await waitFor(() => expect(box('Customer Part No').textContent).toContain('—'))

    fireEvent.change(control('Part Serial Number'), { target: { value: 'P-1' } })
    fireEvent.change(control('Customer'), { target: { value: 'CUST-002' } })
    await waitFor(() => expect(box('Customer Part No').textContent).toContain('—'))
  })

  it('list shows the Customer Part No column', async () => {
    render(<CustomerOrderScreen />)
    const row = (await screen.findByText('PO-1')).closest('tr')
    await waitFor(() => expect(within(row).getByText('ACME-77')).toBeTruthy())
  })

  it('hidden before 045: no field, no column, nothing loaded', async () => {
    q.customerPartNumbersSupported.mockResolvedValue(false)
    render(<CustomerOrderScreen />)
    await screen.findByText('PO-1')
    await waitFor(() => expect(q.customerPartNumbersSupported).toHaveBeenCalled())
    expect(screen.queryByText('Customer Part No')).toBeNull()
    expect(q.listCustomerPartNumbers).not.toHaveBeenCalled()
  })

  it('never saved on the line', async () => {
    render(<CustomerOrderScreen />)
    await screen.findByText('PO-1')
    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    fireEvent.change(within(box('PO Number')).getByRole('textbox'), { target: { value: 'PO-2' } })
    fireEvent.change(within(box('PO Date')).getByDisplayValue(''), { target: { value: '2026-11-09' } })
    fireEvent.change(control('Part Serial Number'), { target: { value: 'P-1' } })
    fireEvent.change(within(box('Order Qty')).getByRole('spinbutton'), { target: { value: '5' } })
    await waitFor(() => expect(box('Customer Part No').textContent).toContain('ACME-77'))
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(q.createCustomerOrder).toHaveBeenCalled())
    const payload = q.createCustomerOrder.mock.calls[0][0]
    expect(JSON.stringify(payload)).not.toMatch(/ACME-77|customer_part/)
  })
})
