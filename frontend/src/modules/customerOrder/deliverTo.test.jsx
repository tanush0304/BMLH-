// @vitest-environment jsdom
// New Order (Phase C): Order Type required, default Manufacturing; Deliver
// To per line (hidden + never sent before 042; after it: the customer's
// active addresses, default pre-selected, required when it has addresses,
// saved as delivery_address_id).
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
  productCustomerSupported: vi.fn(async () => false),
  deliveryAddressesSupported: vi.fn(),
  listDeliveryAddresses: vi.fn(),
}))
vi.mock('../../data/queries/customerOrders', () => q)
vi.mock('../../data/queries/customerPoHeaders', () => q)
vi.mock('../../data/queries/customerEnquiries', () => q)
vi.mock('../../data/queries/customers', () => q)
vi.mock('../../data/queries/products', () => q)
vi.mock('../../data/queries/deliveryAddresses', () => q)
// Native select in place of the searchable one, so the test can pick values.
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

const ADDR = [
  { id: 1, customer_id: 'CUST-001', label: 'Default', city: 'Chennai', is_default: true, is_active: true },
  { id: 2, customer_id: 'CUST-001', label: 'Plant 1 - Hosur', city: 'Hosur', is_default: false, is_active: true },
  { id: 3, customer_id: 'CUST-001', label: 'Old', city: 'Salem', is_default: false, is_active: false },
]

beforeEach(() => {
  q.listCustomerOrders.mockReset().mockResolvedValue([
    { order_line_id: 7, customer_id: 'CUST-001', po_number: 'PO-1', po_date: '2026-11-01', part_serial_number: 'P-1', order_qty: 10, order_type: 'Labour', delivery_address_id: 2 },
  ])
  q.listProductionOrders.mockReset().mockResolvedValue([])
  q.listPoHeaders.mockReset().mockResolvedValue([])
  q.createPoHeader.mockReset().mockResolvedValue({ id: 55 })
  q.listCustomerEnquiries.mockReset().mockResolvedValue([])
  q.listCustomers.mockReset().mockResolvedValue([
    { customer_id: 'CUST-001', customer_name: 'Acme' },
    { customer_id: 'CUST-002', customer_name: 'Bolt' },
  ])
  q.listProducts.mockReset().mockResolvedValue([{ part_serial_number: 'P-1', part_name: 'Shaft' }])
  q.resolveProductWithConfirmation.mockReset().mockImplementation(async (p) => ({ partSerialNumber: p.partSerialNumber, knownProducts: p.knownProducts }))
  q.createCustomerOrder.mockReset().mockImplementation(async (p) => ({ order_line_id: 99, ...p }))
  q.deliveryAddressesSupported.mockReset().mockResolvedValue(true)
  q.listDeliveryAddresses.mockReset().mockResolvedValue(ADDR)
})
afterEach(() => cleanup())

const control = (label) => {
  const span = screen.getAllByText(label, { selector: 'span' })[0]
  return within(span.closest('label')).getByRole('combobox')
}
const textbox = (label) => within(screen.getByText(label, { selector: 'span' }).closest('label')).getByRole('textbox')

async function fillPo(customer = 'CUST-001') {
  await screen.findByText('PO-1')
  fireEvent.change(control('Customer'), { target: { value: customer } })
  fireEvent.change(textbox('PO Number'), { target: { value: 'PO-2' } })
  fireEvent.change(within(screen.getByText('PO Date', { selector: 'span' }).closest('label')).getByDisplayValue(''), { target: { value: '2026-11-09' } })
  fireEvent.change(control('Part Serial Number'), { target: { value: 'P-1' } })
  fireEvent.change(within(screen.getByText('Order Qty', { selector: 'span' }).closest('label')).getByRole('spinbutton'), { target: { value: '5' } })
}

const save = () => fireEvent.click(screen.getByRole('button', { name: /^Save/ }))

describe('New Order -- Order Type + Deliver To', () => {
  it('Order Type defaults to Manufacturing on a new line', async () => {
    render(<CustomerOrderScreen />)
    await screen.findByText('PO-1')
    expect(control('Order Type').value).toBe('Manufacturing')
  })

  it('Order Type is required', async () => {
    render(<CustomerOrderScreen />)
    await fillPo()
    fireEvent.change(control('Order Type'), { target: { value: '' } })
    save()
    expect(await screen.findByText('Order Type is required.')).toBeTruthy()
    expect(q.createPoHeader).not.toHaveBeenCalled()
  })

  it('before 042: no Deliver To, payload has no delivery_address_id', async () => {
    q.deliveryAddressesSupported.mockResolvedValue(false)
    render(<CustomerOrderScreen />)
    await fillPo()
    expect(screen.queryByText('Deliver To', { selector: 'span' })).toBeNull()
    save()
    await waitFor(() => expect(q.createCustomerOrder).toHaveBeenCalled())
    const payload = q.createCustomerOrder.mock.calls[0][0]
    expect(payload).not.toHaveProperty('delivery_address_id')
    expect(payload.order_type).toBe('Manufacturing')
  })

  it('after 042: default address pre-selected, only active ones offered, saved', async () => {
    render(<CustomerOrderScreen />)
    await waitFor(() => expect(q.listDeliveryAddresses).toHaveBeenCalled())
    await fillPo()
    const deliver = control('Deliver To')
    expect(deliver.value).toBe('1')
    const labels = within(deliver).getAllByRole('option').map((o) => o.textContent)
    expect(labels).toEqual(['', 'Default · Chennai', 'Plant 1 - Hosur · Hosur'])
    fireEvent.change(deliver, { target: { value: '2' } })
    save()
    await waitFor(() => expect(q.createCustomerOrder).toHaveBeenCalled())
    expect(q.createCustomerOrder.mock.calls[0][0]).toMatchObject({ delivery_address_id: 2, order_type: 'Manufacturing', parent_po_id: 55 })
  })

  it('after 042: Deliver To required when the customer has addresses', async () => {
    render(<CustomerOrderScreen />)
    await waitFor(() => expect(q.listDeliveryAddresses).toHaveBeenCalled())
    await fillPo()
    fireEvent.change(control('Deliver To'), { target: { value: '' } })
    save()
    expect(await screen.findByText(/Deliver To is required/)).toBeTruthy()
    expect(q.createPoHeader).not.toHaveBeenCalled()
  })

  it('after 042: a customer without addresses saves with null', async () => {
    render(<CustomerOrderScreen />)
    await waitFor(() => expect(q.listDeliveryAddresses).toHaveBeenCalled())
    await fillPo('CUST-002')
    save()
    await waitFor(() => expect(q.createCustomerOrder).toHaveBeenCalled())
    expect(q.createCustomerOrder.mock.calls[0][0].delivery_address_id).toBeNull()
  })

  it('list shows Order Type and Deliver To (label · city)', async () => {
    render(<CustomerOrderScreen />)
    await screen.findByText('PO-1')
    expect(await screen.findByText('Plant 1 - Hosur · Hosur')).toBeTruthy()
    expect(screen.getByText('Labour', { selector: 'td' })).toBeTruthy()
  })
})
