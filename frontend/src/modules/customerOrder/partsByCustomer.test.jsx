// @vitest-environment jsdom
// New Order (045): the part dropdown shows the PO customer's parts +
// unassigned parts; changing the customer clears a new line's part of
// another customer; a part created here gets customer_id = the PO's
// customer; editing an existing line keeps a part of another customer.
// Before 045: every part, nothing cleared, no customer_id sent.
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
  productCustomerSupported: vi.fn(),
  deliveryAddressesSupported: vi.fn(),
  listDeliveryAddresses: vi.fn(),
}))
vi.mock('../../data/queries/customerOrders', () => q)
vi.mock('../../data/queries/customerPoHeaders', () => q)
vi.mock('../../data/queries/customerEnquiries', () => q)
vi.mock('../../data/queries/customers', () => q)
vi.mock('../../data/queries/products', () => q)
vi.mock('../../data/queries/deliveryAddresses', () => q)
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
    // an old line whose part now belongs to another customer
    { order_line_id: 7, customer_id: 'CUST-001', po_number: 'PO-1', po_date: '2026-11-01', part_serial_number: 'B-1', order_qty: 10, order_type: 'Labour' },
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
    { part_serial_number: 'A-1', part_name: 'Shaft', customer_id: 'CUST-001' },
    { part_serial_number: 'B-1', part_name: 'Gear', customer_id: 'CUST-002' },
    { part_serial_number: 'U-1', part_name: 'Pin', customer_id: null },
  ])
  q.resolveProductWithConfirmation.mockReset().mockImplementation(async (p) => ({
    partSerialNumber: p.isNewPart ? p.newPartCode : p.partSerialNumber,
    knownProducts: p.knownProducts,
  }))
  q.createCustomerOrder.mockReset().mockImplementation(async (p) => ({ order_line_id: 99, ...p }))
  q.productCustomerSupported.mockReset().mockResolvedValue(true)
  q.deliveryAddressesSupported.mockReset().mockResolvedValue(false)
  q.listDeliveryAddresses.mockReset().mockResolvedValue([])
})
afterEach(() => cleanup())

const label = (text) => screen.getAllByText(text, { selector: 'span' })[0].closest('label')
const control = (text) => within(label(text)).getByRole('combobox')
const optionValues = (select) => within(select).getAllByRole('option').map((o) => o.value).filter(Boolean)

async function ready() {
  render(<CustomerOrderScreen />)
  await screen.findByText('PO-1')
  await waitFor(() => expect(q.productCustomerSupported).toHaveBeenCalled())
}

describe('New Order -- parts by customer (045)', () => {
  it("line part list = the customer's parts + unassigned; every part before a customer is picked", async () => {
    await ready()
    const parts = () => optionValues(control('Part Serial Number')).filter((v) => ['A-1', 'B-1', 'U-1'].includes(v))
    await waitFor(() => expect(parts()).toEqual(['A-1', 'B-1', 'U-1']))
    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    await waitFor(() => expect(parts()).toEqual(['A-1', 'U-1']))
  })

  it("changing the customer clears a new line's part of another customer, keeps an unassigned one", async () => {
    await ready()
    fireEvent.change(control('Customer'), { target: { value: 'CUST-002' } })
    fireEvent.change(control('Part Serial Number'), { target: { value: 'B-1' } })
    expect(control('Part Serial Number').value).toBe('B-1')
    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    await waitFor(() => expect(control('Part Serial Number').value).toBe(''))

    fireEvent.change(control('Part Serial Number'), { target: { value: 'U-1' } })
    fireEvent.change(control('Customer'), { target: { value: 'CUST-002' } })
    expect(control('Part Serial Number').value).toBe('U-1')
  })

  it("a part created on the spot gets the PO's customer", async () => {
    await ready()
    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    fireEvent.change(within(label('PO Number')).getByRole('textbox'), { target: { value: 'PO-2' } })
    fireEvent.change(within(label('PO Date')).getByDisplayValue(''), { target: { value: '2026-11-09' } })
    const part = control('Part Serial Number')
    const newValue = within(part).getAllByRole('option').find((o) => /Add New Part/.test(o.textContent)).value
    fireEvent.change(part, { target: { value: newValue } })
    fireEvent.change(screen.getByPlaceholderText('Type new part number'), { target: { value: 'NEW-9' } })
    fireEvent.change(within(label('Part Name')).getByRole('textbox'), { target: { value: 'Bush' } })
    fireEvent.change(within(label('Order Qty')).getByRole('spinbutton'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(q.resolveProductWithConfirmation).toHaveBeenCalled())
    expect(q.resolveProductWithConfirmation.mock.calls[0][0]).toMatchObject({ isNewPart: true, newPartCode: 'NEW-9', customerId: 'CUST-001' })
  })

  it('editing an existing line keeps its part even when it belongs to another customer', async () => {
    await ready()
    fireEvent.click(screen.getByText('PO-1'))
    const product = await waitFor(() => control('Product'))
    expect(product.value).toBe('B-1')
    expect(optionValues(product)).toEqual(['A-1', 'B-1', 'U-1'])
    fireEvent.click(screen.getByRole('button', { name: /^Edit/ }))
    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    expect(control('Product').value).toBe('B-1')
  })

  it('before 045: every part, nothing cleared, no customer_id on a new part', async () => {
    q.productCustomerSupported.mockResolvedValue(false)
    await ready()
    fireEvent.change(control('Customer'), { target: { value: 'CUST-002' } })
    fireEvent.change(control('Part Serial Number'), { target: { value: 'B-1' } })
    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    expect(control('Part Serial Number').value).toBe('B-1')
    expect(optionValues(control('Part Serial Number')).filter((v) => ['A-1', 'B-1', 'U-1'].includes(v))).toEqual(['A-1', 'B-1', 'U-1'])
  })
})
