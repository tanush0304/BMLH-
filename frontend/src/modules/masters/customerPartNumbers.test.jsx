// @vitest-environment jsdom
// Customer Master "Customer Part Numbers" (045): hidden before 045; after
// it, lists the open customer's rows, validates (our part + customer part
// no required, one active per part), saves trimmed, deactivates (no delete).
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
  isMissingTableError: vi.fn(),
  customerPartNumbersSupported: vi.fn(),
  listCustomerPartNumbers: vi.fn(),
  createCustomerPartNumber: vi.fn(),
  updateCustomerPartNumber: vi.fn(),
  listProducts: vi.fn(),
}))
vi.mock('../../data/queries/customers', () => q)
vi.mock('../../data/queries/deliveryAddresses', () => q)
vi.mock('../../data/queries/customerPartNumbers', () => q)
vi.mock('../../data/queries/products', () => q)
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

import CustomerMaster from './CustomerMaster'

const ROWS = [
  { id: 1, customer_id: 'CUST-001', part_serial_number: 'P-1', customer_part_number: 'CPN-100', customer_drawing_ref: 'D-1', is_active: true },
  { id: 2, customer_id: 'CUST-001', part_serial_number: 'P-2', customer_part_number: 'CPN-OLD', is_active: false },
  { id: 3, customer_id: 'CUST-002', part_serial_number: 'P-1', customer_part_number: 'OTHER-CUST', is_active: true },
]

beforeEach(() => {
  q.listCustomers.mockReset().mockResolvedValue([{ customer_id: 'CUST-001', customer_name: 'Acme' }])
  q.deliveryAddressesSupported.mockReset().mockResolvedValue(false)
  q.listDeliveryAddresses.mockReset().mockResolvedValue([])
  q.customerPartNumbersSupported.mockReset().mockResolvedValue(true)
  q.listCustomerPartNumbers.mockReset().mockResolvedValue(ROWS)
  q.createCustomerPartNumber.mockReset().mockImplementation(async (p) => ({ id: 9, ...p }))
  q.updateCustomerPartNumber.mockReset().mockImplementation(async (id, p) => ({ id, customer_part_number: 'x', ...p }))
  q.listProducts.mockReset().mockResolvedValue([
    { part_serial_number: 'P-1', part_name: 'Shaft' },
    { part_serial_number: 'P-2', part_name: 'Gear' },
    { part_serial_number: 'P-3', part_name: 'Pin' },
  ])
})
afterEach(() => cleanup())

const section = () => screen.getByTestId('customer-part-numbers')
const input = (label) => within(within(section()).getByText(label, { selector: 'span' }).closest('label')).getByRole('textbox')

async function openCustomer() {
  render(<CustomerMaster />)
  fireEvent.click(await screen.findByText('CUST-001'))
  await screen.findByText('CPN-100')
}

describe('Customer Master -- Customer Part Numbers', () => {
  it('hidden before 045 (nothing listed or loaded)', async () => {
    q.customerPartNumbersSupported.mockResolvedValue(false)
    render(<CustomerMaster />)
    fireEvent.click(await screen.findByText('CUST-001'))
    await waitFor(() => expect(q.customerPartNumbersSupported).toHaveBeenCalled())
    expect(screen.queryByText(/Customer Part Numbers/)).toBeNull()
    expect(q.listCustomerPartNumbers).not.toHaveBeenCalled()
  })

  it('numbered 8 when Delivery Addresses is hidden; shows only this customer\'s rows', async () => {
    await openCustomer()
    const heading = screen.getByRole('heading', { name: 'Customer Part Numbers' })
    expect(heading.closest('section').querySelector('span').textContent).toBe('8')
    expect(within(section()).queryByText('OTHER-CUST')).toBeNull()
    expect(within(section()).getByText('CPN-OLD')).toBeTruthy()
  })

  it('numbered 9 after Delivery Addresses when 042 is run', async () => {
    q.deliveryAddressesSupported.mockResolvedValue(true)
    await openCustomer()
    await screen.findByRole('heading', { name: 'Delivery Addresses' })
    const heading = screen.getByRole('heading', { name: 'Customer Part Numbers' })
    await waitFor(() => expect(heading.closest('section').querySelector('span').textContent).toBe('9'))
  })

  it('new customer: "Save the customer first"', async () => {
    render(<CustomerMaster />)
    await screen.findByText('CUST-001')
    fireEvent.click(screen.getByRole('button', { name: /^New/ }))
    expect(await screen.findByText(/Save the customer first, then add its part numbers/)).toBeTruthy()
  })

  it('validation: our part required, customer part no required, one active per part', async () => {
    await openCustomer()
    fireEvent.click(screen.getByRole('button', { name: '+ Add customer part number' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Part Number' }))
    expect(await screen.findByText('Our Part is required.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Our Part'), { target: { value: 'P-3' } })
    fireEvent.change(input('Customer Part No'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Part Number' }))
    expect(await screen.findByText('Customer Part No is required.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Our Part'), { target: { value: 'P-1' } })
    fireEvent.change(input('Customer Part No'), { target: { value: 'NEW' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Part Number' }))
    expect(await screen.findByText('P-1 already has a customer part number for this customer -- edit it instead.')).toBeTruthy()
    expect(q.createCustomerPartNumber).not.toHaveBeenCalled()
  })

  it('a part whose only row is inactive can get a new one; saved trimmed, blanks null', async () => {
    await openCustomer()
    fireEvent.click(screen.getByRole('button', { name: '+ Add customer part number' }))
    fireEvent.change(screen.getByLabelText('Our Part'), { target: { value: 'P-2' } })
    fireEvent.change(input('Customer Part No'), { target: { value: '  CPN-200 ' } })
    fireEvent.change(input('Customer Drawing Ref'), { target: { value: ' D-2 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Part Number' }))
    await waitFor(() => expect(q.createCustomerPartNumber).toHaveBeenCalledTimes(1))
    expect(q.createCustomerPartNumber).toHaveBeenCalledWith({
      customer_id: 'CUST-001',
      part_serial_number: 'P-2',
      customer_part_number: 'CPN-200',
      customer_part_name: null,
      customer_drawing_ref: 'D-2',
      revision: null,
      is_active: true,
    })
  })

  it('edit never sends customer / part; Deactivate updates is_active only', async () => {
    await openCustomer()
    const row = within(section()).getByText('CPN-100').closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Our Part').disabled).toBe(true)
    fireEvent.change(input('Revision'), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Part Number' }))
    await waitFor(() => expect(q.updateCustomerPartNumber).toHaveBeenCalledTimes(1))
    const [id, payload] = q.updateCustomerPartNumber.mock.calls[0]
    expect(id).toBe(1)
    expect(payload).not.toHaveProperty('customer_id')
    expect(payload).not.toHaveProperty('part_serial_number')
    expect(payload.revision).toBe('C')

    fireEvent.click(within(within(section()).getByText('CPN-100').closest('tr')).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(q.updateCustomerPartNumber).toHaveBeenLastCalledWith(1, { is_active: false }))
  })
})
