// @vitest-environment jsdom
// Quality gate after jobwork (055) on Production Data Entry Start: the stage
// right before this one is a jobwork stage whose receipt has no Accepted
// inspection -> popup, no log; supervisor override with a reason -> log starts;
// inspected / before 055 / gate off -> starts as before.
// (Same screen harness as machineShiftClash.test.jsx; the gate's own data comes
// from loadQcGateData, mocked here with a jobwork stage before stage 11.)
import { render, screen, waitFor, cleanup, fireEvent, within, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STAGES = [
  { id: 11, prd_no: 'PRD-001', seq: 1, type: 'Internal', status: 'Pending', operation: 'Turning', machine_id: 'MC01', cycle_time_min: 2 },
]
const GATE_STAGES = [
  { id: 10, prd_no: 'PRD-001', seq: 0, type: 'Outsourced', operation: 'Toughening', job_work_code: 'HT' },
  { id: 11, prd_no: 'PRD-001', seq: 1, type: 'Internal', operation: 'Turning' },
]
const q = vi.hoisted(() => ({
  createProductionLog: vi.fn(async (p) => ({ id: 99, ...p })),
  gateSupported: true,
  gateData: null,
  createQcOverride: vi.fn(async (p) => ({ id: 1, ...p })),
}))
vi.mock('../../data/queries/jobworkQc', () => ({
  jobworkQcGateSupported: async () => q.gateSupported,
  loadQcGateData: vi.fn(async () => q.gateData),
  createQcOverride: (...a) => q.createQcOverride(...a),
}))
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
vi.mock('../../data/queries/shifts', () => ({
  listShifts: vi.fn(async () => [{ shift_code: 'SHIFT-A', start_time: '8:00 AM', end_time: '8:00 PM', lunch_break_duration: '60 min' }]),
}))
vi.mock('../../data/queries/machines', () => ({ listMachines: vi.fn(async () => [{ machine_id: 'MC01', machine_name: 'CNC 1', category: 'CNC' }]) }))
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
  listCycleTimesForPart: vi.fn(async () => [{ part_serial_number: 'P1', seq: 1, machine_id: 'MC01', cycle_time_min: 2 }]),
}))
vi.mock('../../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => []) }))
vi.mock('../../data/queries/shiftVerifications', () => ({ listShiftVerificationsForLog: vi.fn(async () => []) }))
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

const gateData = (extra = {}) => ({
  settings: { on: true, from: null },
  stages: GATE_STAGES,
  dispatches: [{ dc_no: 'DC-008', prd_no: 'PRD-001', stage_id: 10, qty: 411, voided_at: null }],
  receipts: [{ id: 8, dc_no: 'DC-008', receipt_no: 'JR-008', qty_received: 411, receipt_date: '2026-11-15', created_at: '2026-11-17T00:00:00Z' }],
  qcLogs: [],
  overrides: [],
  ...extra,
})

beforeEach(() => {
  q.createProductionLog.mockClear()
  q.createQcOverride.mockClear()
  q.gateSupported = true
  q.gateData = gateData()
})
afterEach(cleanup)

const control = (label) => within(screen.getAllByText(label, { selector: 'span' })[0].closest('label')).getByRole('combobox')

async function readyToStart(role = 'operator') {
  render(<ProductionDataEntryScreen role={role} />)
  await waitFor(() => expect(within(control('PRD No')).queryByRole('option', { name: /PRD-001/ })).toBeTruthy())
  fireEvent.change(control('Employee ID'), { target: { value: 'E1' } })
  fireEvent.change(control('PRD No'), { target: { value: 'PRD-001' } })
  await waitFor(() => expect(screen.getByTestId('planned-machine-hint')).toBeTruthy())
  fireEvent.change(control('Machine'), { target: { value: 'MC01' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start Production' })).toBeTruthy())
  fireEvent.change(control('Shift'), { target: { value: 'SHIFT-A' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start Production' }).disabled).toBe(false))
}
const start = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Production' })))

describe('Production Data Entry -- incoming QC gate (055)', () => {
  it('receipt not inspected: operator gets the popup (OK only), no log is started', async () => {
    await readyToStart('operator')
    await start()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toMatch(
      /PRD-001: Toughening \(DC-008, JR-008\) was received on 15-11-2026 but has no quality inspection yet\. Ask Quality to inspect it before starting Stage 2\./,
    )
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['OK'])
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'OK' })))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(q.createProductionLog).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Start Production' }).disabled).toBe(false) // can retry after QC
  })

  it('Rejected inspection: blocked with the rejected message', async () => {
    q.gateData = gateData({ qcLogs: [{ id: 1, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'Rejected' }] })
    await readyToStart('operator')
    await start()
    expect((await screen.findByRole('alertdialog')).textContent).toMatch(/was Rejected at inspection on 16-11-2026/)
    expect(q.createProductionLog).not.toHaveBeenCalled()
  })

  it('supervisor override with a reason: override saved for the receipt, then the log starts', async () => {
    await readyToStart('supervisor')
    await start()
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.change(within(dialog).getByLabelText('Override reason'), { target: { value: 'Vendor certificate checked' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Override and continue' })))
    await waitFor(() => expect(q.createProductionLog).toHaveBeenCalledTimes(1))
    expect(q.createQcOverride).toHaveBeenCalledWith({ receiptId: 8, reason: 'Vendor certificate checked' })
    expect(q.createProductionLog.mock.calls[0][0]).toMatchObject({ prd_no: 'PRD-001', stage_id: 11, machine_id: 'MC01' })
  })

  it('Accepted inspection: starts with no popup', async () => {
    q.gateData = gateData({ qcLogs: [{ id: 1, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'Accepted' }] })
    await readyToStart('operator')
    await start()
    await waitFor(() => expect(q.createProductionLog).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('before 055: starts as before', async () => {
    q.gateSupported = false
    await readyToStart('operator')
    await start()
    await waitFor(() => expect(q.createProductionLog).toHaveBeenCalledTimes(1))
  })

  it('gate off (seeded off): starts as before', async () => {
    q.gateData = gateData({ settings: { on: false, from: null } })
    await readyToStart('operator')
    await start()
    await waitFor(() => expect(q.createProductionLog).toHaveBeenCalledTimes(1))
  })
})
