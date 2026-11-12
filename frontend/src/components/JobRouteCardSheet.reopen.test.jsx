// @vitest-environment jsdom
// Reopen stage (049) on the Job Route Card: supervisor / admin only, only on a
// Completed stage, only once 049 is run. Blockers (from the DB function)
// -> OK-only notice, no dialog; none -> dialog with a required reason ->
// update { status: 'Pending', reopen_reason }; latest reopen shown under the pill.
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STAGES = [
  { id: 1, prd_no: 'PRD-003', seq: 10, operation: 'Cutting', type: 'Internal', machine_id: 'MC01', status: 'Completed', actual_date: '2026-11-10' },
  { id: 2, prd_no: 'PRD-003', seq: 20, operation: 'Turning', type: 'Internal', machine_id: 'MC02', status: 'Pending',
    reopened_by: 'u-1', reopened_at: '2026-11-11T09:00:00Z', reopen_reason: 'qty recount' },
]
const q = vi.hoisted(() => ({
  supported: vi.fn(async () => true),
  blockers: vi.fn(async () => []),
  reopen: vi.fn(async () => ({})),
  getStages: vi.fn(),
}))
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../data/queries/routeCards', () => ({
  getRouteCard: vi.fn(async () => ({ jc_no: 'JC-003', batch_qty: 100, shift_hours: 11 })),
  getStagesForPrd: q.getStages,
  stageReopenSupported: q.supported,
  getStageReopenBlockers: q.blockers,
  reopenStage: q.reopen,
}))
vi.mock('../data/queries/customerOrders', () => ({ listOrdersByPrd: vi.fn(async () => [{ prd_no: 'PRD-003', part_serial_number: 'P1', prd_qty: 100, batch_no: 1 }]) }))
vi.mock('../data/queries/products', () => ({ listProducts: vi.fn(async () => []) }))
vi.mock('../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: vi.fn(async () => []) }))
vi.mock('../data/queries/jobOrders', () => ({ listJobOrderStatus: vi.fn(async () => []) }))
vi.mock('../data/queries/machines', () => ({ listMachines: vi.fn(async () => []) }))
vi.mock('../data/queries/productionLogs', () => ({ listLogsForPrd: vi.fn(async () => []) }))
vi.mock('../data/queries/deliveryAddresses', () => ({ deliveryAddressesSupported: vi.fn(async () => false), listDeliveryAddresses: vi.fn(async () => []) }))
vi.mock('../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => [{ user_id: 'u-1', email: 'sup@x.test' }]) }))

const { default: JobRouteCardSheet } = await import('./JobRouteCardSheet')
const { withStagePositions } = await import('../utils/stageLabel')

beforeEach(() => {
  q.supported.mockReset().mockResolvedValue(true)
  q.blockers.mockReset().mockResolvedValue([])
  q.reopen.mockReset().mockResolvedValue({})
  q.getStages.mockReset().mockImplementation(async () => withStagePositions(STAGES))
})
afterEach(cleanup)

async function open(role = 'supervisor') {
  render(<JobRouteCardSheet prdNo="PRD-003" role={role} />)
  await waitFor(() => expect(screen.getByText('Cutting')).toBeTruthy())
}

describe('Job Route Card -- Reopen stage (049)', () => {
  it('supervisor: Reopen only on the Completed stage', async () => {
    await open()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen stage 1' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Reopen stage 2' })).toBeNull()
  })

  it('operator: no Reopen button; before 049: no button for anyone', async () => {
    await open('operator')
    expect(screen.queryByRole('button', { name: /Reopen stage/ })).toBeNull()
    expect(q.supported).not.toHaveBeenCalled()
    cleanup()
    q.supported.mockResolvedValue(false)
    await open('admin')
    await waitFor(() => expect(q.supported).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Reopen stage/ })).toBeNull()
  })

  it('blocked: OK-only notice listing what blocks it, no reason dialog, nothing saved', async () => {
    q.blockers.mockResolvedValue(['Stage 2 – Turning has production logs (log #12, #14)', 'WIP was received from this stage (WIR-005)'])
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen stage 1' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain(
      "Can't reopen Stage 1 – Cutting: Stage 2 – Turning has production logs (log #12, #14); WIP was received from this stage (WIR-005).",
    )
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['OK'])
    expect(q.blockers).toHaveBeenCalledWith(1)
    expect(q.reopen).not.toHaveBeenCalled()
  })

  it('allowed: reason required, then reopens and reloads', async () => {
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen stage 1' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Reopen stage?')).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: 'Reopen stage' })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Reopen reason'), { target: { value: '   ' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Reopen reason'), { target: { value: 'Marked complete too early' } })
    expect(confirm.disabled).toBe(false)
    const loadsBefore = q.getStages.mock.calls.length
    fireEvent.click(confirm)
    await waitFor(() => expect(q.reopen).toHaveBeenCalledWith(1, 'Marked complete too early'))
    await waitFor(() => expect(q.getStages.mock.calls.length).toBeGreaterThan(loadsBefore))
    expect(await screen.findByText(/Stage 1 – Cutting reopened -- it is Pending again\./)).toBeTruthy()
  })

  it('DB refusal is shown as a toast', async () => {
    q.reopen.mockRejectedValue({ message: "Can't reopen this stage: Stage 2 – Turning has production logs (log #12).", code: '23514' })
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen stage 1' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.change(within(dialog).getByLabelText('Reopen reason'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen stage' }))
    expect(await screen.findByText(/has production logs \(log #12\)/)).toBeTruthy()
  })

  it('latest reopen shown under the status', async () => {
    await open()
    await waitFor(() => expect(screen.getByTestId('reopened-note-2').textContent).toBe('Reopened by sup@x.test on 11-11-2026: qty recount'))
  })
})
