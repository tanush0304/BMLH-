// @vitest-environment jsdom
// Job Work Receipt -- Close DC Short (2026-11-13): no longer an always-open
// section under every receipt. A separate "Close DC Short..." button
// (supervisor / admin, open DC with a balance, no receipt qty typed) opens a
// confirm with a required reason; DB rules (031) unchanged.
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DC = { dc_no: 'DC-004', prd_no: 'PRD-020', vendor_id: 'V1', job_work_code: 'JW1', qty: 300, qty_received: 200, balance_qty: 100, status: 'Partially Received', is_open: true, receipt_nos: 'JR-010' }
const q = vi.hoisted(() => ({
  status: vi.fn(),
  closeShort: vi.fn(async () => ({})),
  createReceipt: vi.fn(async () => ({ receipt_no: 'JR-011' })),
}))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } } }))
vi.mock('../../data/queries/jobOrders', () => ({
  listJobOrderStatus: q.status,
  listReceipts: vi.fn(async () => []),
  createReceipt: q.createReceipt,
  closeDispatchShort: q.closeShort,
  updateReceipt: vi.fn(async () => ({})),
}))
vi.mock('../../data/queries/vendors', () => ({ listVendors: vi.fn(async () => [{ vendor_id: 'V1', vendor_name: 'Vendor A' }]) }))
vi.mock('../../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: vi.fn(async () => []) }))
vi.mock('../../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => []) }))
vi.mock('../../utils/usePartForPrd', () => ({ default: () => ({}) }))

const { default: JobOrderReceiptScreen } = await import('./JobOrderReceiptScreen')
const { canShowCloseShort, closeShortPromptText } = await import('../../utils/jobwork')

beforeEach(() => {
  q.status.mockReset().mockResolvedValue([DC])
  q.closeShort.mockReset().mockResolvedValue({})
  q.createReceipt.mockReset().mockResolvedValue({ receipt_no: 'JR-011' })
})
afterEach(cleanup)

async function open(role = 'supervisor') {
  render(<JobOrderReceiptScreen role={role} initialDcNo="DC-004" />)
  await waitFor(() => expect(screen.getByText('Partially Received')).toBeTruthy())
}
const button = () => screen.queryByText('Close DC Short...')?.closest('button') ?? null
const findButton = async () => (await screen.findByText('Close DC Short...')).closest('button')

describe('canShowCloseShort', () => {
  it('supervisor + open DC + balance + no qty typed', () => {
    const base = { canClose: true, dc: DC, balance: 100, qtyTyped: '' }
    expect(canShowCloseShort(base)).toBe(true)
    expect(canShowCloseShort({ ...base, canClose: false })).toBe(false)
    expect(canShowCloseShort({ ...base, dc: null })).toBe(false)
    expect(canShowCloseShort({ ...base, dc: { ...DC, is_open: false } })).toBe(false)
    expect(canShowCloseShort({ ...base, balance: 0 })).toBe(false)
    expect(canShowCloseShort({ ...base, qtyTyped: '50' })).toBe(false)
    expect(canShowCloseShort({ ...base, qtyTyped: '  ' })).toBe(true)
  })
  it('prompt text', () => {
    expect(closeShortPromptText(DC, 100)).toBe(
      "200 of 300 received. The remaining 100 will be recorded as not coming back and DC-004 will be closed. This can't be undone.",
    )
  })
})

describe('Job Work Receipt -- Close DC Short button', () => {
  it('no always-open "Close DC Short" section any more', async () => {
    await open()
    expect(screen.queryByText('2. Close DC Short')).toBeNull()
  })

  it('supervisor: button with a DC picked; hidden while a receipt qty is typed', async () => {
    await open()
    expect(await findButton()).toBeTruthy()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } })
    expect(button()).toBeNull()
  })

  it('operator: no button', async () => {
    await open('operator')
    expect(button()).toBeNull()
  })

  it('reason required; confirm closes the DC short', async () => {
    await open()
    fireEvent.click(await findButton())
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Close DC-004 short?')).toBeTruthy()
    expect(dialog.textContent).toContain('The remaining 100 will be recorded as not coming back')
    const confirm = within(dialog).getByRole('button', { name: 'Close Short' })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Close short reason'), { target: { value: '10 pcs scrapped at vendor' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(q.closeShort).toHaveBeenCalledWith('DC-004', '10 pcs scrapped at vendor'))
    expect(await screen.findByText(/DC-004 closed short \(100 short\)\./)).toBeTruthy()
    expect(q.createReceipt).not.toHaveBeenCalled()
  })

  it('Cancel: nothing saved', async () => {
    await open()
    fireEvent.click(await findButton())
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(q.closeShort).not.toHaveBeenCalled()
  })

  it('DB refusal shown as a toast', async () => {
    q.closeShort.mockRejectedValue({ message: 'DC DC-004 is already closed', code: '23514' })
    await open()
    fireEvent.click(await findButton())
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.change(within(dialog).getByLabelText('Close short reason'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Short' }))
    expect(await screen.findByText(/already closed/)).toBeTruthy()
  })
})
