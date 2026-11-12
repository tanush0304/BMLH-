// @vitest-environment jsdom
// PRD-009: Manual Operations hour save -- produced over the hour's standard
// (cycle time 1 min, 60-min slot -> 60) or over the log's planned qty opens
// the "Quantity over the limit" popup and nothing is saved; drafts stay.
import { createElement } from 'react'
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const LOG = { id: 7, prd_no: 'PRD-002', stage_id: 2, machine_id: null, shift_code: 'SHIFT-A', is_open: true, planned_qty: 100, cycle_time_min: 1, standard_qty_per_hour: 60, employee_id: 'EMP-1' }
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }))
const q = vi.hoisted(() => ({ addProductionLogHours: vi.fn(async () => []), hours: [] }))
vi.mock('../../data/queries/productionLogs', () => ({
  listOpenLogsForUser: vi.fn(async () => [LOG]),
  listAllOpenLogs: vi.fn(async () => [LOG]),
  shiftHours046Supported: vi.fn(async () => true),
  listOtherMachineShiftHours: vi.fn(async () => []),
  getStageAggregatesForPrd: vi.fn(async () => ({})),
  createProductionLog: vi.fn(),
  addProductionLogHour: vi.fn(),
  addProductionLogHours: q.addProductionLogHours,
  getLogTotals: vi.fn(async () => null),
  getOpenLogForStage: vi.fn(async () => LOG),
  listLogHoursForLogIds: vi.fn(async () => q.hours),
  closeProductionLog: vi.fn(),
  endProductionLog: vi.fn(),
  updateProductionLogHours: vi.fn(async () => []),
}))
vi.mock('../../data/queries/currentUser', () => ({ getCurrentUserId: vi.fn(async () => 'user-1') }))
vi.mock('../../data/queries/employees', () => ({ listEmployees: vi.fn(async () => [{ employee_id: 'EMP-1', employee_name: 'Ravi' }]) }))
vi.mock('../../data/queries/shifts', () => ({ listShifts: vi.fn(async () => [{ shift_code: 'SHIFT-A', start_time: '8:00 AM', end_time: '8:00 PM', lunch_break_duration: '60 min' }]) }))
vi.mock('../../data/queries/machines', () => ({ listMachines: vi.fn(async () => []) }))
vi.mock('../../data/queries/customerOrders', () => ({ listOrdersByPrd: vi.fn(async () => [{ prd_no: 'PRD-002', prd_qty: 100, part_serial_number: 'P1' }]) }))
vi.mock('../../data/queries/products', () => ({ listProducts: vi.fn(async () => []) }))
vi.mock('../../data/queries/routeCards', () => ({
  listAllStages: vi.fn(async () => [{ id: 2, prd_no: 'PRD-002', seq: 1, type: 'Manual', status: 'Pending', operation: 'Deburr' }]),
  getStagesForPrd: vi.fn(async () => [{ id: 2, prd_no: 'PRD-002', seq: 1, type: 'Manual', status: 'Pending', operation: 'Deburr' }]),
  updateStageStatus: vi.fn(),
}))
vi.mock('../../data/queries/machineOperations', () => ({ listAllMachineOperations: vi.fn(async () => []) }))
vi.mock('../../data/queries/wip', () => ({ getWipAggregatesForPrd: vi.fn(async () => ({})) }))
vi.mock('../../data/queries/cycleTimes', () => ({ listCycleTimesForPart: vi.fn(async () => []) }))
vi.mock('../../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => []) }))
const capSettings = vi.hoisted(() => ({ value: {} }))
vi.mock('../../data/queries/appSettings', () => ({ getHourCapSettings: vi.fn(async () => capSettings.value) }))
vi.mock('../../data/queries/shiftVerifications', () => ({ listShiftVerificationsForLog: vi.fn(async () => []) }))

const { default: ManualOperationsScreen } = await import('./ManualOperationsScreen')

afterEach(() => {
  cleanup()
  q.addProductionLogHours.mockClear()
  q.hours = []
  capSettings.value = {}
})

async function typeHour1(value, role = 'operator') {
  render(createElement(ManualOperationsScreen, { role }))
  const input = await screen.findByLabelText('Hour 1 produced', {}, { timeout: 3000 })
  fireEvent.change(input, { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Hours' }))
  return input
}

describe('Manual Operations: hour qty caps before save', () => {
  it('produced over the hour standard -> popup, nothing saved, the typed value stays', async () => {
    const input = await typeHour1('70')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Quantity over the limit')).toBeTruthy()
    expect(within(dialog).getByTestId('qty-cap-list').textContent).toContain('Hour 1: produced 70 is more than the standard 60 for this hour (60 min net ÷ 1 min cycle time).')
    expect(q.addProductionLogHours).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(input.value).toBe('70')
  })

  it('log total over planned qty -> popup with the planned message', async () => {
    q.hours = [{ id: 1, log_id: 7, hour_slot: 2, log_date: '2000-01-01', shift_code: 'SHIFT-A', qty_produced: 60 }]
    await typeHour1('50')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByTestId('qty-cap-list').textContent).toContain("Produced 110 is more than this log's planned qty 100")
    expect(q.addProductionLogHours).not.toHaveBeenCalled()
  })

  it('within both caps -> saved', async () => {
    await typeHour1('60')
    await waitFor(() => expect(q.addProductionLogHours).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('supervisor_override, supervisor: warning -> Cancel saves nothing, Save anyway saves', async () => {
    capSettings.value = { mode: 'supervisor_override', tolerancePct: '0' }
    await typeHour1('70', 'supervisor')
    let dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Over the hourly standard')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(q.addProductionLogHours).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Hours' }))
    dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save anyway' }))
    await waitFor(() => expect(q.addProductionLogHours).toHaveBeenCalledTimes(1))
  })

  it('supervisor_override, operator: still blocked', async () => {
    capSettings.value = { mode: 'supervisor_override', tolerancePct: '0' }
    await typeHour1('70')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Quantity over the limit')).toBeTruthy()
    expect(q.addProductionLogHours).not.toHaveBeenCalled()
  })

  it('off: no hourly cap -> saved', async () => {
    capSettings.value = { mode: 'off', tolerancePct: '0' }
    await typeHour1('90')
    await waitFor(() => expect(q.addProductionLogHours).toHaveBeenCalledTimes(1))
  })
})
