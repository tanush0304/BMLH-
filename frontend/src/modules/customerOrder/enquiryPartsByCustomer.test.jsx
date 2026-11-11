// @vitest-environment jsdom
// New Enquiry (045): part list = the customer's parts + unassigned + the
// enquiry's current part; a new enquiry's part of another customer is
// cleared when the customer changes; an existing enquiry keeps its part.
// Before 045: every part, nothing cleared.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const q = vi.hoisted(() => ({
  listCustomerEnquiries: vi.fn(),
  createCustomerEnquiry: vi.fn(),
  updateCustomerEnquiry: vi.fn(),
  deleteCustomerEnquiry: vi.fn(),
  generateNextQtnNo: vi.fn(),
  createEnquiryRevision: vi.fn(),
  listCustomers: vi.fn(),
  listProducts: vi.fn(),
  resolveProductWithConfirmation: vi.fn(),
  productCustomerSupported: vi.fn(),
  listCustomerOrders: vi.fn(),
}))
vi.mock('../../data/queries/customerEnquiries', () => q)
vi.mock('../../data/queries/customers', () => q)
vi.mock('../../data/queries/products', () => q)
vi.mock('../../data/queries/customerOrders', () => q)
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

import CustomerEnquiryScreen from './CustomerEnquiryScreen'

beforeEach(() => {
  q.listCustomerEnquiries.mockReset().mockResolvedValue([
    { qtn_no: 'QTN-001', customer_id: 'CUST-001', part_serial_number: 'B-1', part_name: 'Gear', enquiry_date: '2026-11-01' },
  ])
  q.listCustomers.mockReset().mockResolvedValue([
    { customer_id: 'CUST-001', customer_name: 'Acme' },
    { customer_id: 'CUST-002', customer_name: 'Bolt' },
  ])
  q.listProducts.mockReset().mockResolvedValue([
    { part_serial_number: 'A-1', part_name: 'Shaft', customer_id: 'CUST-001' },
    { part_serial_number: 'B-1', part_name: 'Gear', customer_id: 'CUST-002' },
    { part_serial_number: 'U-1', part_name: 'Pin', customer_id: null },
  ])
  q.listCustomerOrders.mockReset().mockResolvedValue([])
  q.generateNextQtnNo.mockReset().mockResolvedValue('QTN-002')
  q.productCustomerSupported.mockReset().mockResolvedValue(true)
})
afterEach(() => cleanup())

const control = (text) => within(screen.getAllByText(text, { selector: 'span' })[0].closest('label')).getByRole('combobox')
const parts = () => within(control('Part Serial Number')).getAllByRole('option').map((o) => o.value).filter((v) => ['A-1', 'B-1', 'U-1'].includes(v))

async function ready() {
  render(<CustomerEnquiryScreen />)
  await screen.findByText('QTN-001')
  await waitFor(() => expect(q.productCustomerSupported).toHaveBeenCalled())
}

describe('New Enquiry -- parts by customer (045)', () => {
  it("customer's parts + unassigned; a part of another customer is cleared on a new enquiry", async () => {
    await ready()
    await waitFor(() => expect(parts()).toEqual(['A-1', 'B-1', 'U-1']))
    fireEvent.change(control('Customer'), { target: { value: 'CUST-002' } })
    await waitFor(() => expect(parts()).toEqual(['B-1', 'U-1']))
    fireEvent.change(control('Part Serial Number'), { target: { value: 'B-1' } })
    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    await waitFor(() => expect(control('Part Serial Number').value).toBe(''))
    expect(parts()).toEqual(['A-1', 'U-1'])
  })

  it('an existing enquiry keeps its part (and it stays in the list) even for another customer', async () => {
    await ready()
    fireEvent.click(screen.getByText('QTN-001'))
    await waitFor(() => expect(control('Part Serial Number').value).toBe('B-1'))
    expect(parts()).toEqual(['A-1', 'B-1', 'U-1'])
  })

  it('before 045: every part, nothing cleared', async () => {
    q.productCustomerSupported.mockResolvedValue(false)
    await ready()
    fireEvent.change(control('Customer'), { target: { value: 'CUST-002' } })
    fireEvent.change(control('Part Serial Number'), { target: { value: 'B-1' } })
    fireEvent.change(control('Customer'), { target: { value: 'CUST-001' } })
    expect(control('Part Serial Number').value).toBe('B-1')
    expect(parts()).toEqual(['A-1', 'B-1', 'U-1'])
  })
})
