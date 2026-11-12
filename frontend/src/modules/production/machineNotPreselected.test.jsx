// @vitest-environment jsdom
// Production Data Entry (2026-11-11): after a PRD is picked the Machine
// field stays EMPTY -- the next stage's planned machine is only a hint
// ("Planned: ... (Stage 1 – Turning, next stage)") and listed first, never
// pre-selected. With no machine there is no Start (the stage section needs
// one) and a "Select the machine to continue." note; the stage / cycle time
// are resolved only once a machine is picked.
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const STAGES = [
  { id: 11, prd_no: 'PRD-001', seq: 1, type: 'Internal', status: 'Pending', operation: 'Turning', machine_id: 'MC02', cycle_time_min: 2 },
]
const q = vi.hoisted(() => ({ createProductionLog: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }))
vi.mock('../../data/queries/productionLogs', () => ({
  listOpenLogsForUser: vi.fn(async () => []),
  listAllOpenLogs: vi.fn(async () => []),
  shiftHours046Supported: vi.fn(async () => false),
  listOtherMachineShiftHours: vi.fn(async () => []),
  getStageAggregatesForPrd: vi.fn(async () => ({})),
  createProductionLog: q.createProductionLog,
  addProductionLogHour: vi.fn(),
  addProductionLogHours: vi.fn(),
  getLogTotals: vi.fn(async () => null),
  getOpenLogForStage: vi.fn(async () => null),
  listLogHoursForLogIds: vi.fn(async () => []),
  closeProductionLog: vi.fn(),
  endProductionLog: vi.fn(),
  updateProductionLogHours: vi.fn(async () => []),
}))
vi.mock('../../data/queries/currentUser', () => ({ getCurrentUserId: vi.fn(async () => 'user-1') }))
vi.mock('../../data/queries/employees', () => ({ listEmployees: vi.fn(async () => [{ employee_id: 'E1', employee_name: 'Ravi' }]) }))
vi.mock('../../data/queries/shifts', () => ({ listShifts: vi.fn(async () => [{ shift_code: 'SHIFT-A', start_time: '8:00 AM', end_time: '8:00 PM' }]) }))
vi.mock('../../data/queries/machines', () => ({
  listMachines: vi.fn(async () => [
    { machine_id: 'MC01', machine_name: 'CNC 1', category: 'CNC' },
    { machine_id: 'MC02', machine_name: 'CNC 2', category: 'CNC' },
  ]),
}))
vi.mock('../../data/queries/customerOrders', () => ({
  listOrdersByPrd: vi.fn(async () => [{ prd_no: 'PRD-001', part_serial_number: 'P1', prd_qty: 10, order_qty: 10 }]),
}))
vi.mock('../../data/queries/products', () => ({ listProducts: vi.fn(async () => [{ part_serial_number: 'P1', part_name: 'Shaft' }]) }))
vi.mock('../../data/queries/routeCards', () => ({
  listAllStages: vi.fn(async () => STAGES),
  getStagesForPrd: vi.fn(async () => STAGES),
  updateStageStatus: vi.fn(),
}))
vi.mock('../../data/queries/machineOperations', () => ({ listAllMachineOperations: vi.fn(async () => []) }))
vi.mock('../../data/queries/wip', () => ({ getWipAggregatesForPrd: vi.fn(async () => ({})) }))
vi.mock('../../data/queries/cycleTimes', () => ({
  listCycleTimesForPart: vi.fn(async () => [
    { part_serial_number: 'P1', seq: 1, machine_id: 'MC01', cycle_time_min: 3 },
    { part_serial_number: 'P1', seq: 1, machine_id: 'MC02', cycle_time_min: 2 },
  ]),
}))
vi.mock('../../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => []) }))
vi.mock('../../data/queries/shiftVerifications', () => ({ listShiftVerificationsForLog: vi.fn(async () => []) }))
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

const { default: ProductionDataEntryScreen } = await import('./ProductionDataEntryScreen')

afterEach(cleanup)

const control = (label) => within(screen.getAllByText(label, { selector: 'span' })[0].closest('label')).getByRole('combobox')

async function pickPrd() {
  render(<ProductionDataEntryScreen role="operator" />)
  await waitFor(() => expect(within(control('PRD No')).queryByRole('option', { name: /PRD-001/ })).toBeTruthy())
  fireEvent.change(control('PRD No'), { target: { value: 'PRD-001' } })
  await waitFor(() => expect(screen.getByTestId('planned-machine-hint')).toBeTruthy())
}

describe('Production Data Entry -- Machine starts empty', () => {
  it('after a PRD: Machine empty, planned machine as a hint and listed first', async () => {
    await pickPrd()
    const machine = control('Machine')
    expect(machine.value).toBe('')
    expect(screen.getByTestId('planned-machine-hint').textContent).toMatch(/^Planned: .*MC02.* \(Stage 1 – Turning, next stage\)$/)
    const opts = within(machine).getAllByRole('option').map((o) => o.value).filter(Boolean)
    expect(opts[0]).toBe('MC02')
    expect(within(machine).getAllByRole('option')[1].textContent).toContain('(planned · next stage)')
  })

  it('no machine: no Start / stage section, "Select the machine to continue." under the field, nothing saved', async () => {
    await pickPrd()
    expect(screen.queryByRole('button', { name: 'Start Production' })).toBeNull()
    expect(screen.getByTestId('machine-required-note').textContent).toBe('Select the machine to continue.')
    expect(q.createProductionLog).not.toHaveBeenCalled()
  })

  it('picking a machine resolves the stage + cycle time (same as before) and shows Start', async () => {
    await pickPrd()
    fireEvent.change(control('Machine'), { target: { value: 'MC01' } })
    await waitFor(() => expect(control('Machine').value).toBe('MC01'))
    await waitFor(() => expect(screen.getByDisplayValue('3')).toBeTruthy()) // MC01's own cycle time
    expect(screen.getByRole('button', { name: 'Start Production' })).toBeTruthy()
    expect(screen.queryByTestId('machine-required-note')).toBeNull()
  })
})
