// @vitest-environment jsdom
// Customer Master "Delivery Addresses" (042): hidden before 042; after it,
// lists the open customer's addresses, validates (label / pincode / GSTIN),
// moves the default (old default cleared first) and deactivates (no delete).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const q = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  deliveryAddressesSupported: vi.fn(),
  listDeliveryAddresses: vi.fn(),
  createDeliveryAddress: vi.fn(),
  updateDeliveryAddress: vi.fn(),
}))
vi.mock('../../data/queries/customers', () => q)
vi.mock('../../data/queries/deliveryAddresses', () => q)

import CustomerMaster from './CustomerMaster'

const ADDR = [
  { id: 1, customer_id: 'CUST-001', label: 'Default', city: 'Chennai', is_default: true, is_active: true },
  { id: 2, customer_id: 'CUST-001', label: 'Plant 1 - Hosur', city: 'Hosur', is_default: false, is_active: true },
  { id: 3, customer_id: 'CUST-002', label: 'Other Customer', city: 'Pune', is_default: true, is_active: true },
]

beforeEach(() => {
  q.listCustomers.mockReset().mockResolvedValue([{ customer_id: 'CUST-001', customer_name: 'Acme' }])
  q.deliveryAddressesSupported.mockReset().mockResolvedValue(true)
  q.listDeliveryAddresses.mockReset().mockResolvedValue(ADDR)
  q.createDeliveryAddress.mockReset().mockImplementation(async (p) => ({ id: 9, ...p }))
  q.updateDeliveryAddress.mockReset().mockImplementation(async (id, p) => ({ id, label: 'x', ...p }))
})
afterEach(() => cleanup())

const section = () => screen.getByTestId('delivery-addresses')
const input = (label) => within(within(section()).getByText(label, { selector: 'span' }).closest('label')).getByRole('textbox')

async function openCustomer() {
  render(<CustomerMaster />)
  fireEvent.click(await screen.findByText('CUST-001'))
  await screen.findByText('Plant 1 - Hosur')
}

describe('Customer Master -- Delivery Addresses', () => {
  it('hidden before 042', async () => {
    q.deliveryAddressesSupported.mockResolvedValue(false)
    render(<CustomerMaster />)
    await screen.findByText('CUST-001')
    await waitFor(() => expect(q.deliveryAddressesSupported).toHaveBeenCalled())
    expect(screen.queryByText('Delivery Addresses')).toBeNull()
    expect(q.listDeliveryAddresses).not.toHaveBeenCalled()
  })

  it('new customer: asks to save the customer first', async () => {
    render(<CustomerMaster />)
    expect(await screen.findByText(/Save the customer first/)).toBeTruthy()
  })

  it("lists only the open customer's addresses, no Delete", async () => {
    await openCustomer()
    const s = section()
    expect(within(s).getByText('Default', { selector: 'td' })).toBeTruthy()
    expect(within(s).queryByText('Other Customer')).toBeNull()
    expect(within(s).getAllByRole('button', { name: 'Deactivate' })).toHaveLength(2)
    expect(within(s).queryByRole('button', { name: /Delete/ })).toBeNull()
  })

  it('validates label, pincode and GSTIN before saving', async () => {
    await openCustomer()
    fireEvent.click(screen.getByRole('button', { name: '+ Add delivery address' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }))
    expect(await screen.findByText('Label is required.')).toBeTruthy()
    fireEvent.change(input('Label'), { target: { value: 'plant 1 - hosur' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }))
    expect(await screen.findByText('plant 1 - hosur already exists for this customer.')).toBeTruthy()
    fireEvent.change(input('Label'), { target: { value: 'Plant 2' } })
    fireEvent.change(input('Pincode'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }))
    expect(await screen.findByText('Pincode must be 6 digits.')).toBeTruthy()
    fireEvent.change(input('Pincode'), { target: { value: '635126' } })
    fireEvent.change(input('GSTIN'), { target: { value: 'BAD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }))
    expect(await screen.findByText(/valid 15-character GSTIN/)).toBeTruthy()
    expect(q.createDeliveryAddress).not.toHaveBeenCalled()
  })

  it('saving a new default clears the old default first', async () => {
    await openCustomer()
    fireEvent.click(screen.getByRole('button', { name: '+ Add delivery address' }))
    fireEvent.change(input('Label'), { target: { value: ' Plant 2 ' } })
    fireEvent.change(input('GSTIN'), { target: { value: '33aaaaa0000a1z5' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Default' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }))
    await waitFor(() => expect(q.createDeliveryAddress).toHaveBeenCalled())
    expect(q.updateDeliveryAddress).toHaveBeenCalledWith(1, { is_default: false })
    expect(q.updateDeliveryAddress.mock.invocationCallOrder[0]).toBeLessThan(q.createDeliveryAddress.mock.invocationCallOrder[0])
    expect(q.createDeliveryAddress.mock.calls[0][0]).toMatchObject({ customer_id: 'CUST-001', label: 'Plant 2', gstin: '33AAAAA0000A1Z5', is_default: true, is_active: true })
  })

  it('Deactivate = update is_active false (and drops default)', async () => {
    await openCustomer()
    fireEvent.click(within(section()).getAllByRole('button', { name: 'Deactivate' })[0])
    await waitFor(() => expect(q.updateDeliveryAddress).toHaveBeenCalledWith(1, { is_active: false, is_default: false }))
  })
})
