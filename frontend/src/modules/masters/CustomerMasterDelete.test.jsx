// @vitest-environment jsdom
// Customer Master (MasterFormScreen): Delete opens the confirm dialog
// instead of deleting; Cancel keeps the record; confirming deletes once.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const deleteCustomer = vi.fn(async () => {})
vi.mock('../../data/queries/customers', () => ({
  listCustomers: vi.fn(async () => [{ customer_id: 'CUST-001', customer_name: 'Acme Components' }]),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: (...a) => deleteCustomer(...a),
}))
const confirmSpy = vi.spyOn(window, 'confirm')

const { default: CustomerMaster } = await import('./CustomerMaster')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Customer Master delete', () => {
  it('Delete opens the dialog; Cancel deletes nothing; Delete in the dialog deletes once', async () => {
    await act(async () => { render(<CustomerMaster />) })
    fireEvent.click(screen.getByText('Acme Components'))
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))

    expect(screen.getByRole('alertdialog').textContent).toContain('CUST-001 – Acme Components will be permanently deleted')
    expect(screen.getByRole('heading', { name: 'Delete customer?' })).toBeTruthy()
    expect(deleteCustomer).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(deleteCustomer).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))
    const dialog = screen.getByRole('alertdialog')
    await act(async () => { fireEvent.click(dialog.querySelector('button:last-child')) })
    expect(deleteCustomer).toHaveBeenCalledTimes(1)
    expect(deleteCustomer).toHaveBeenCalledWith('CUST-001')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
