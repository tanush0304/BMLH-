// @vitest-environment jsdom
// Route Card "Mark complete" (2026-11-13): supervisor / admin, Internal +
// Pending stage whose processed output reached the target (same rule as Data
// Entry), no open log on it. Confirm -> updateStageStatus(id, 'Completed'),
// sheet reloads. 047 guards the DB.
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STAGES = [
  { id: 1, prd_no: 'PRD-009', seq: 10, operation: 'Cutting', type: 'Internal', machine_id: 'MC01', status: 'Pending' },
  { id: 2, prd_no: 'PRD-009', seq: 20, operation: 'Plating', type: 'Outsourced', machine_id: null, status: 'Pending' },
  { id: 3, prd_no: 'PRD-009', seq: 30, operation: 'Turning', type: 'Internal', machine_id: 'MC02', status: 'Pending' },
]
const q = vi.hoisted(() => ({
  getStages: vi.fn(),
  update: vi.fn(async () => ({})),
  aggregates: vi.fn(),
  logs: vi.fn(async () => []),
}))
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../data/queries/routeCards', () => ({
  getRouteCard: vi.fn(async () => ({ jc_no: 'JC-009', batch_qty: 500, shift_hours: 11 })),
  getStagesForPrd: q.getStages,
  stageReopenSupported: vi.fn(async () => true),
  getStageReopenBlockers: vi.fn(async () => []),
  reopenStage: vi.fn(async () => ({})),
  updateStageStatus: q.update,
}))
vi.mock('../data/queries/customerOrders', () => ({ listOrdersByPrd: vi.fn(async () => [{ prd_no: 'PRD-009', part_serial_number: 'P1', prd_qty: 500, batch_no: 1 }]) }))
vi.mock('../data/queries/products', () => ({ listProducts: vi.fn(async () => []) }))
vi.mock('../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: vi.fn(async () => []) }))
vi.mock('../data/queries/jobOrders', () => ({ listJobOrderStatus: vi.fn(async () => []) }))
vi.mock('../data/queries/machines', () => ({ listMachines: vi.fn(async () => []) }))
vi.mock('../data/queries/productionLogs', () => ({ listLogsForPrd: q.logs, getStageAggregatesForPrd: q.aggregates }))
vi.mock('../data/queries/deliveryAddresses', () => ({ deliveryAddressesSupported: vi.fn(async () => false), listDeliveryAddresses: vi.fn(async () => []) }))
vi.mock('../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => []) }))

const { default: JobRouteCardSheet } = await import('./JobRouteCardSheet')
const { withStagePositions } = await import('../utils/stageLabel')
const { routeCardCompleteState } = await import('../utils/stageStartGuard')

const REACHED = { 1: { output: 500, accepted: 490, consumed: 0 }, 2: { output: 490, accepted: 490, consumed: 0 } }

beforeEach(() => {
  q.getStages.mockReset().mockImplementation(async () => withStagePositions(STAGES))
  q.update.mockReset().mockResolvedValue({})
  q.aggregates.mockReset().mockResolvedValue(REACHED)
  q.logs.mockReset().mockResolvedValue([{ id: 7, prd_no: 'PRD-009', stage_id: 1, is_open: false }])
})
afterEach(cleanup)

async function open(role = 'supervisor') {
  render(<JobRouteCardSheet prdNo="PRD-009" role={role} />)
  await waitFor(() => expect(screen.getByText('Cutting')).toBeTruthy())
}

describe('routeCardCompleteState', () => {
  const base = { role: 'supervisor', stageType: 'Internal', stageStatus: 'Pending', output: 500, target: 500, hasOpenLog: false }
  it('button only for supervisor/admin, Internal, Pending, at target', () => {
    expect(routeCardCompleteState(base)).toBe('button')
    expect(routeCardCompleteState({ ...base, role: 'admin' })).toBe('button')
    expect(routeCardCompleteState({ ...base, role: 'operator' })).toBeNull()
    expect(routeCardCompleteState({ ...base, stageType: 'Outsourced' })).toBeNull()
    expect(routeCardCompleteState({ ...base, stageStatus: 'Completed' })).toBeNull()
    expect(routeCardCompleteState({ ...base, output: 499 })).toBeNull()
    expect(routeCardCompleteState({ ...base, target: 0, output: 0 })).toBeNull()
    expect(routeCardCompleteState({ ...base, hasOpenLog: true })).toBe('end-log-first')
  })
})

describe('Job Route Card -- Mark complete', () => {
  it('supervisor: button on the Internal Pending stage at target only', async () => {
    await open()
    expect(await screen.findByRole('button', { name: 'Mark stage 1 complete' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark stage 2 complete' })).toBeNull() // Outsourced
    expect(screen.queryByRole('button', { name: 'Mark stage 3 complete' })).toBeNull() // 0 of 490
  })

  it('below target: no button', async () => {
    q.aggregates.mockResolvedValue({ 1: { output: 499, accepted: 499, consumed: 0 } })
    await open()
    await waitFor(() => expect(q.aggregates).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Mark stage .* complete/ })).toBeNull()
  })

  it('operator: no button, aggregates not loaded', async () => {
    await open('operator')
    expect(screen.queryByRole('button', { name: /Mark stage .* complete/ })).toBeNull()
    expect(q.aggregates).not.toHaveBeenCalled()
  })

  it('open log on the stage: note instead of the button', async () => {
    q.logs.mockResolvedValue([{ id: 8, prd_no: 'PRD-009', stage_id: 1, is_open: true }])
    await open()
    expect(await screen.findByTestId('complete-open-log-1')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark stage 1 complete' })).toBeNull()
  })

  it('confirm: same prompt as Data Entry, completes and reloads', async () => {
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Mark stage 1 complete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('Stage 1 – Cutting reached 500 of 500 (accepted 490) -- mark it complete?')
    const loadsBefore = q.getStages.mock.calls.length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Complete' }))
    await waitFor(() => expect(q.update).toHaveBeenCalledWith(1, 'Completed'))
    await waitFor(() => expect(q.getStages.mock.calls.length).toBeGreaterThan(loadsBefore))
    expect(await screen.findByText(/Stage 1 – Cutting marked complete\./)).toBeTruthy()
  })

  it('Not now: nothing saved', async () => {
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Mark stage 1 complete' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not now' }))
    expect(q.update).not.toHaveBeenCalled()
  })

  it('DB refusal (047) shown as a toast', async () => {
    q.update.mockRejectedValue({ message: 'Only a supervisor or admin can mark a stage complete.', code: '42501' })
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Mark stage 1 complete' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Mark Complete' }))
    expect(await screen.findByText(/supervisor or admin can mark a stage complete/)).toBeTruthy()
  })

  it('aggregate lookup failure: card still shows, no button', async () => {
    q.aggregates.mockRejectedValue(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await open()
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Mark stage .* complete/ })).toBeNull()
    warn.mockRestore()
  })
})
