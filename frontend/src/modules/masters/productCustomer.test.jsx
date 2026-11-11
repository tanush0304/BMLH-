// @vitest-environment jsdom
// 045 on the masters:
//  - Product Master: optional Customer (searchable), Customer list column +
//    export; before 045 hidden and customer_id never sent; the list-only
//    customer_label is never sent.
//  - Customer Master: old section 7 gone (no required drawing ref), its four
//    columns never sent on save (old values stay); read-only "Products for
//    this customer" card after 045 only.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const q = vi.hoisted(() => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  productCustomerSupported: vi.fn(),
  listRawMaterials: vi.fn(),
  listProductRawMaterials: vi.fn(),
  setProductRawMaterials: vi.fn(),
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  deliveryAddressesSupported: vi.fn(),
  listDeliveryAddresses: vi.fn(),
  isMissingTableError: vi.fn(),
}))
vi.mock('../../data/queries/products', () => q)
vi.mock('../../data/queries/rawMaterials', () => q)
vi.mock('../../data/queries/productRawMaterials', () => q)
vi.mock('../../data/queries/customers', () => q)
vi.mock('../../data/queries/deliveryAddresses', () => q)
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options, disabled, 'aria-label': ariaLabel }) => (
    <select aria-label={ariaLabel} value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {(options ?? []).map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o }
        return <option key={opt.value} value={opt.value}>{opt.label}</option>
      })}
    </select>
  ),
}))

import ProductMaster from './ProductMaster'
import CustomerMaster, { withoutLegacySection7 } from './CustomerMaster'

const CUSTOMER_ROW = {
  customer_id: 'CUST-001',
  customer_name: 'Acme',
  currency: 'INR',
  contact_person_name: 'Ravi',
  email_address: 'ravi@example.com',
  registered_address: '1 Main Rd',
  registered_city: 'Chennai',
  registered_state: 'TN',
  delivery_address: '1 Main Rd',
  delivery_city: 'Chennai',
  delivery_state: 'TN',
  payment_terms: '30 Days',
  customer_product_part_number: 'OLD-CPN',
  customer_product_part_name: 'Old name',
  customer_drawing_ref_no: 'OLD-DWG',
  revision_drawing_no: 'A',
}

beforeEach(() => {
  q.listProducts.mockReset().mockResolvedValue([
    { part_serial_number: 'P-1', part_name: 'Shaft', part_drawing_reference_number: 'D-1', product_status: 'Active', customer_id: 'CUST-001' },
    { part_serial_number: 'P-2', part_name: 'Gear', customer_id: null },
    { part_serial_number: 'P-3', part_name: 'Other', customer_id: 'CUST-002' },
  ])
  q.createProduct.mockReset().mockImplementation(async (p) => p)
  q.updateProduct.mockReset().mockImplementation(async (_k, p) => p)
  q.productCustomerSupported.mockReset().mockResolvedValue(true)
  q.listRawMaterials.mockReset().mockResolvedValue([])
  q.listProductRawMaterials.mockReset().mockResolvedValue([])
  q.setProductRawMaterials.mockReset().mockResolvedValue(undefined)
  q.listCustomers.mockReset().mockResolvedValue([CUSTOMER_ROW, { customer_id: 'CUST-002', customer_name: 'Bolt' }])
  q.updateCustomer.mockReset().mockImplementation(async (_k, p) => p)
  q.createCustomer.mockReset().mockImplementation(async (p) => p)
  q.deliveryAddressesSupported.mockReset().mockResolvedValue(true)
  q.listDeliveryAddresses.mockReset().mockResolvedValue([])
})
afterEach(() => cleanup())

const save = () => fireEvent.click(screen.getByRole('button', { name: /^Save/ }))

describe('Product Master -- Customer (045)', () => {
  it('Customer column + field; saves customer_id (blank -> null); list label never sent', async () => {
    render(<ProductMaster />)
    const row = (await screen.findByText('P-1')).closest('tr')
    await waitFor(() => expect(within(row).getByText('Acme (CUST-001)')).toBeTruthy())
    expect(screen.getAllByText('Customer').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('P-2'))
    fireEvent.click(screen.getByRole('button', { name: /^Edit/ }))
    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'CUST-002' } })
    save()
    await waitFor(() => expect(q.updateProduct).toHaveBeenCalledTimes(1))
    let payload = q.updateProduct.mock.calls[0][1]
    expect(payload.customer_id).toBe('CUST-002')
    expect(payload).not.toHaveProperty('customer_label')

    fireEvent.click(screen.getByText('P-1'))
    fireEvent.click(screen.getByRole('button', { name: /^Edit/ }))
    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: '' } })
    save()
    await waitFor(() => expect(q.updateProduct).toHaveBeenCalledTimes(2))
    payload = q.updateProduct.mock.calls[1][1]
    expect(payload.customer_id).toBeNull()
  })

  it('before 045: no field, no column, customer_id never sent', async () => {
    q.productCustomerSupported.mockResolvedValue(false)
    q.listProducts.mockResolvedValue([{ part_serial_number: 'P-2', part_name: 'Gear' }])
    render(<ProductMaster />)
    await screen.findByText('P-2')
    await waitFor(() => expect(q.productCustomerSupported).toHaveBeenCalled())
    expect(screen.queryByLabelText('Customer')).toBeNull()
    expect(screen.queryByText('Customer', { selector: 'th' })).toBeNull()
    fireEvent.click(screen.getByText('P-2'))
    fireEvent.click(screen.getByRole('button', { name: /^Edit/ }))
    save()
    await waitFor(() => expect(q.updateProduct).toHaveBeenCalled())
    const payload = q.updateProduct.mock.calls[0][1]
    expect(payload).not.toHaveProperty('customer_id')
    expect(payload).not.toHaveProperty('customer_label')
  })
})

describe('Customer Master -- section 7 removed + products card', () => {
  it('withoutLegacySection7 strips exactly the four old columns', () => {
    const out = withoutLegacySection7(CUSTOMER_ROW)
    expect(Object.keys(CUSTOMER_ROW).length - Object.keys(out).length).toBe(4)
    expect(out).not.toHaveProperty('customer_drawing_ref_no')
    expect(out.customer_name).toBe('Acme')
  })

  it('no section 7; saving an existing customer works without the drawing ref and never sends the old columns', async () => {
    render(<CustomerMaster />)
    fireEvent.click(await screen.findByText('CUST-001'))
    expect(screen.queryByText('Customer Product & Drawing Details')).toBeNull()
    expect(screen.queryByText('Customer Drawing Reference No')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Edit/ }))
    save()
    await waitFor(() => expect(q.updateCustomer).toHaveBeenCalledTimes(1))
    const payload = q.updateCustomer.mock.calls[0][1]
    for (const k of ['customer_product_part_number', 'customer_product_part_name', 'customer_drawing_ref_no', 'revision_drawing_no']) {
      expect(payload).not.toHaveProperty(k)
    }
  })

  it("products card (8, after Delivery Addresses 7): this customer's products only, read-only", async () => {
    render(<CustomerMaster />)
    fireEvent.click(await screen.findByText('CUST-001'))
    const card = await screen.findByTestId('customer-products')
    await waitFor(() => expect(within(card).getByText('P-1')).toBeTruthy())
    expect(within(card).getByText('Shaft')).toBeTruthy()
    expect(within(card).getByText('D-1')).toBeTruthy()
    expect(within(card).queryByText('P-2')).toBeNull()
    expect(within(card).queryByText('P-3')).toBeNull()
    expect(within(card).queryByRole('button')).toBeNull()
    const heading = screen.getByRole('heading', { name: 'Products for this customer' })
    expect(heading.closest('section').querySelector('span').textContent).toBe('8')
  })

  it('products card hidden before 045', async () => {
    q.productCustomerSupported.mockResolvedValue(false)
    render(<CustomerMaster />)
    fireEvent.click(await screen.findByText('CUST-001'))
    await waitFor(() => expect(q.productCustomerSupported).toHaveBeenCalled())
    expect(screen.queryByText('Products for this customer')).toBeNull()
  })
})
