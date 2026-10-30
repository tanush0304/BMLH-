// @vitest-environment jsdom
// Credit Period on Customer, Vendor and Supplier Master: same dropdown as Payment Terms --
// MASTER_PAYMENT_TERMS + values already saved in credit_period + "+ Add new";
// a saved value outside the list still shows on edit.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MASTER_PAYMENT_TERMS } from '../../utils/poTermsOptions'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const q = vi.hoisted(() => ({
  listVendors: vi.fn(),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
  deleteVendor: vi.fn(),
  listJobWorkTypes: vi.fn(),
  createJobWorkType: vi.fn(),
  listJobWorkTypesForVendor: vi.fn(),
  setVendorJobWorkTypes: vi.fn(),
  listSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}))
vi.mock('../../data/queries/vendors', () => q)
vi.mock('../../data/queries/jobWorkTypes', () => q)
vi.mock('../../data/queries/vendorJobWorkTypes', () => q)
vi.mock('../../data/queries/suppliers', () => q)
vi.mock('../../data/queries/customers', () => q)

import VendorMaster from './VendorMaster'
import SupplierMaster from './SupplierMaster'
import CustomerMaster from './CustomerMaster'

beforeEach(() => {
  q.listVendors.mockReset().mockResolvedValue([
    { vendor_id: 'VEN-001', vendor_name: 'Alpha Platers', credit_period: '120 Days' },
    { vendor_id: 'VEN-002', vendor_name: 'Beta Coaters', credit_period: '30 Days' },
    { vendor_id: 'VEN-003', vendor_name: 'Gamma Heat', credit_period: null },
  ])
  q.listJobWorkTypes.mockReset().mockResolvedValue([])
  q.listJobWorkTypesForVendor.mockReset().mockResolvedValue([])
  q.listSuppliers.mockReset().mockResolvedValue([
    { supplier_id: 'SUP-001', supplier_name: 'Steel Co', credit_period: '75 Days' },
    { supplier_id: 'SUP-002', supplier_name: 'Wire Co', credit_period: '45 Days' },
  ])
  q.listCustomers.mockReset().mockResolvedValue([
    { customer_id: 'CUST-001', customer_name: 'Acme Engineering', credit_period: '100 Days' },
    { customer_id: 'CUST-002', customer_name: 'Bolt Works', credit_period: '60 Days' },
  ])
})
afterEach(() => cleanup())

function creditSelect() {
  return within(screen.getByText('Credit Period').closest('label')).getByRole('combobox')
}
const optionTexts = (select) => within(select).getAllByRole('option').map((o) => o.textContent)

function expectOptions(options, saved) {
  for (const term of MASTER_PAYMENT_TERMS) expect(options).toContain(term)
  for (const v of saved) expect(options).toContain(v)
  for (const term of MASTER_PAYMENT_TERMS) expect(options.filter((o) => o === term)).toHaveLength(1)
  expect(options.indexOf(saved[0])).toBeGreaterThan(options.indexOf('90 Days'))
  expect(options.some((o) => /Add new/i.test(o))).toBe(true)
}

describe('Vendor Master credit period', () => {
  it('offers the payment-term built-ins + saved credit periods + "+ Add new"', async () => {
    render(<VendorMaster />)
    await screen.findByText('VEN-001')
    expectOptions(optionTexts(creditSelect()), ['120 Days'])
  })

  it('shows the saved value on edit, even one outside the built-ins', async () => {
    render(<VendorMaster />)
    fireEvent.click(await screen.findByText('VEN-001'))
    await waitFor(() => expect(creditSelect().value).toBe('120 Days'))
  })
})

describe('Supplier Master credit period', () => {
  it('offers the payment-term built-ins + saved credit periods + "+ Add new"', async () => {
    render(<SupplierMaster />)
    await screen.findByText('SUP-001')
    expectOptions(optionTexts(creditSelect()), ['75 Days'])
  })

  it('shows the saved value on edit, even one outside the built-ins', async () => {
    render(<SupplierMaster />)
    fireEvent.click(await screen.findByText('SUP-001'))
    await waitFor(() => expect(creditSelect().value).toBe('75 Days'))
  })
})

describe('Customer Master credit period', () => {
  it('offers the payment-term built-ins + saved credit periods + "+ Add new"', async () => {
    render(<CustomerMaster />)
    await screen.findByText('CUST-001')
    expectOptions(optionTexts(creditSelect()), ['100 Days'])
  })

  it('shows the saved value on edit, even one outside the built-ins', async () => {
    render(<CustomerMaster />)
    fireEvent.click(await screen.findByText('CUST-001'))
    await waitFor(() => expect(creditSelect().value).toBe('100 Days'))
  })
})
