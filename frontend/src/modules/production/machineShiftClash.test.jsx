// @vitest-environment jsdom
// Production Data Entry (2026-11-12): machine / shift clash BEFORE Start.
//   - a machine with another open log is listed but disabled ("— busy: ...")
//   - backup popup (OK only) when the chosen machine turns out to be running
//   - machine + date + shift fully used: popup; operator blocked; supervisor
//     gets "Start as overtime" only while an hour slot is still free
//   - partly used: amber note (remaining hrs, PRDs, first free hour); Start allowed
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STAGES = [
  { id: 11, prd_no: 'PRD-001', seq: 1, type: 'Internal', status: 'Pending', operation: 'Turning', machine_id: 'MC01', cycle_time_min: 2 },
]
const q = vi.hoisted(() => ({
  createProductionLog: vi.fn(async (p) => ({ id: 99, ...p })),
  listAllOpenLogs: vi.fn(async () => []),
  listOtherMachineShiftHours: vi.fn(async () => []),
}))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }))
vi.mock('../../data/queries/productionLogs', () => ({
  listOpenLogsForUser: vi.fn(async () => []),
  listAllOpenLogs: q.listAllOpenLogs,
  shiftHours046Supported: vi.fn(async () => false),
  listOtherMachineShiftHours: q.listOtherMachineShiftHours,
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
// 12 h gross, 60 min break -> 11 net hrs
vi.mock('../../data/queries/shifts', () => ({
  listShifts: vi.fn(async () => [{ shift_code: 'SHIFT-A', start_time: '8:00 AM', end_time: '8:00 PM', lunch_break_duration: '60 min' }]),
}))
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
    { part_serial_number: 'P1', seq: 1, machine_id: 'MC01', cycle_time_min: 2 },
    { part_serial_number: 'P1', seq: 1, machine_id: 'MC02', cycle_time_min: 2 },
  ]),
}))
vi.mock('../../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => []) }))
vi.mock('../../data/queries/shiftVerifications', () => ({ listShiftVerificationsForLog: vi.fn(async () => []) }))
// Daily checklist gate is a separate rule -- kept out of these tests.
vi.mock('../../utils/dailyChecklist', () => ({ gateApplies: () => false, gateAllowsStart: () => true }))
vi.mock('../../components/DailyChecklistGate', () => ({ default: () => null }))
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options, disabled }) => (
    <select value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {(options ?? []).map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o }
        return <option key={opt.value} value={opt.value} disabled={!!opt.disabled}>{opt.label}</option>
      })}
    </select>
  ),
}))

const { default: ProductionDataEntryScreen } = await import('./ProductionDataEntryScreen')

const hours = (slots, prd = 'PRD-002', logId = 5) => slots.map((s) => ({ id: 100 + s, log_id: logId, prd_no: prd, hour_slot: s, lunch: 0 }))

beforeEach(() => {
  q.createProductionLog.mockClear()
  q.listAllOpenLogs.mockReset().mockResolvedValue([])
  q.listOtherMachineShiftHours.mockReset().mockResolvedValue([])
})
afterEach(cleanup)

const control = (label) => within(screen.getAllByText(label, { selector: 'span' })[0].closest('label')).getByRole('combobox')

async function openOn(machine, role = 'operator') {
  render(<ProductionDataEntryScreen role={role} />)
  await waitFor(() => expect(within(control('Production Order (PRD No)')).queryByRole('option', { name: /PRD-001/ })).toBeTruthy())
  fireEvent.change(control('Employee'), { target: { value: 'E1' } })
  fireEvent.change(control('Production Order (PRD No)'), { target: { value: 'PRD-001' } })
  await waitFor(() => expect(screen.getByTestId('planned-machine-hint')).toBeTruthy())
  if (!machine) return
  fireEvent.change(control('Machine'), { target: { value: machine } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start Production' })).toBeTruthy())
  fireEvent.change(control('Shift'), { target: { value: 'SHIFT-A' } })
}

const startBtn = () => screen.getByRole('button', { name: 'Start Production' })

describe('Production Data Entry -- machine / shift clash before Start', () => {
  it('a machine with another open log is listed with "busy" but disabled', async () => {
    q.listAllOpenLogs.mockResolvedValue([{ id: 7, prd_no: 'PRD-009', stage_id: 90, machine_id: 'MC02' }])
    await openOn(null)
    const opt = within(control('Machine')).getByRole('option', { name: /CNC 2.*busy: PRD-009/ })
    expect(opt.disabled).toBe(true)
    expect(within(control('Machine')).getByRole('option', { name: /CNC 1/ }).disabled).toBe(false)
  })

  it('an open log of THIS PRD + stage stays pickable (resume / shift handover)', async () => {
    q.listAllOpenLogs.mockResolvedValue([{ id: 8, prd_no: 'PRD-001', stage_id: 11, machine_id: 'MC02' }])
    await openOn(null)
    expect(within(control('Machine')).getByRole('option', { name: /CNC 2.*busy: PRD-001/ }).disabled).toBe(false)
  })

  it('backup: machine turned busy after the list loaded -> popup (OK only), Start disabled', async () => {
    q.listAllOpenLogs
      .mockResolvedValueOnce([]) // when the PRD was picked
      .mockResolvedValue([{ id: 7, prd_no: 'PRD-009', stage_id: 90, machine_id: 'MC01' }])
    await openOn('MC01')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Machine is busy')).toBeTruthy()
    expect(dialog.textContent).toMatch(/is running PRD-009 \(log #7\)\. End that log first\./)
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['OK'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByTestId('machine-shift-clash').textContent).toMatch(/running PRD-009/)
    expect(startBtn().disabled).toBe(true)
    expect(q.createProductionLog).not.toHaveBeenCalled()
  })

  it('fully used, operator: popup "fully used (11 of 11 hrs by PRD-002)", OK only, Start disabled', async () => {
    q.listOtherMachineShiftHours.mockResolvedValue(hours([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))
    await openOn('MC01')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Shift fully used')).toBeTruthy()
    expect(dialog.textContent).toMatch(/SHIFT-A on .*MC01.* for \d\d-\d\d-\d{4} is fully used \(11 of 11 hrs by PRD-002\)\. Pick another machine or shift\./)
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['OK'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    expect(startBtn().disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Start as overtime' })).toBeNull()
  })

  it('fully used, supervisor with a free slot: "Start as overtime" starts the log', async () => {
    q.listOtherMachineShiftHours.mockResolvedValue(hours([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))
    await openOn('MC01', 'supervisor')
    const dialog = await screen.findByRole('alertdialog')
    expect(startBtn().disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start as overtime' }))
    await waitFor(() => expect(q.createProductionLog).toHaveBeenCalledTimes(1))
    expect(q.createProductionLog.mock.calls[0][0]).toMatchObject({ machine_id: 'MC01', shift_code: 'SHIFT-A', prd_no: 'PRD-001' })
  })

  it('fully used with NO slot left (hour 12 used): supervisor gets OK only, Start disabled (option (a))', async () => {
    q.listOtherMachineShiftHours.mockResolvedValue(hours([1, 12]))
    await openOn('MC01', 'supervisor')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toMatch(/No hour slot is left after hour 12\./)
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['OK'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    expect(startBtn().disabled).toBe(true)
  })

  it('partly used: amber note with hrs left, PRDs and the first free hour; Start allowed', async () => {
    q.listOtherMachineShiftHours.mockResolvedValue([...hours([1, 2], 'PRD-002', 5), ...hours([3], 'PRD-004', 6)])
    await openOn('MC01')
    await waitFor(() => expect(screen.getByTestId('machine-shift-clash').textContent).toMatch(
      /SHIFT-A on .*MC01.* for \d\d-\d\d-\d{4}: 8 of 11 net hrs left \(3 used by PRD-002, PRD-004\)\. New hours start at hour 4\./,
    ))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(startBtn().disabled).toBe(false)
    fireEvent.click(startBtn())
    await waitFor(() => expect(q.createProductionLog).toHaveBeenCalledTimes(1))
  })

  it('nothing on the machine for that shift: no note, Start allowed', async () => {
    await openOn('MC01')
    await waitFor(() => expect(startBtn().disabled).toBe(false))
    expect(screen.queryByTestId('machine-shift-clash')).toBeNull()
    expect(q.listOtherMachineShiftHours).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'MC01', shiftCode: 'SHIFT-A' }))
  })

  it('lookup fails: toast, Start not blocked', async () => {
    q.listOtherMachineShiftHours.mockRejectedValue(new Error('boom'))
    await openOn('MC01')
    await waitFor(() => expect(screen.getByText(/Could not check the machine's hours for this shift/)).toBeTruthy())
    expect(startBtn().disabled).toBe(false)
  })
})
