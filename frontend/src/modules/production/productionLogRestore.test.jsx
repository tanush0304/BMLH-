// @vitest-environment jsdom
import { createElement } from 'react'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Restoring the user's open log is async: until it finishes the PRD / Stage
// (/ Machine) pickers and Employee stay disabled, so a parallel pick can't
// race the restore (utils/productionLogLock.js createRequestGate).
let releaseOpenLogs
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }))
vi.mock('../../data/queries/productionLogs', () => ({
  listOpenLogsForUser: vi.fn(() => new Promise((resolve) => { releaseOpenLogs = resolve })),
  listAllOpenLogs: vi.fn(async () => []),
  getStageAggregatesForPrd: vi.fn(async () => ({})),
  createProductionLog: vi.fn(),
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
vi.mock('../../data/queries/employees', () => ({ listEmployees: vi.fn(async () => []) }))
vi.mock('../../data/queries/shifts', () => ({ listShifts: vi.fn(async () => []) }))
vi.mock('../../data/queries/machines', () => ({ listMachines: vi.fn(async () => []) }))
vi.mock('../../data/queries/customerOrders', () => ({ listOrdersByPrd: vi.fn(async () => []) }))
vi.mock('../../data/queries/products', () => ({ listProducts: vi.fn(async () => []) }))
vi.mock('../../data/queries/routeCards', () => ({
  listAllStages: vi.fn(async () => [
    { id: 1, prd_no: 'PRD-001', seq: 1, type: 'Internal', status: 'Pending', operation: 'Turning', machine_id: 'MC01' },
    { id: 2, prd_no: 'PRD-002', seq: 1, type: 'Manual', status: 'Pending', operation: 'Deburr' },
  ]),
  getStagesForPrd: vi.fn(async () => []),
  updateStageStatus: vi.fn(),
}))
vi.mock('../../data/queries/machineOperations', () => ({ listAllMachineOperations: vi.fn(async () => []) }))
vi.mock('../../data/queries/wip', () => ({ getWipAggregatesForPrd: vi.fn(async () => ({})) }))
vi.mock('../../data/queries/cycleTimes', () => ({ listCycleTimesForPart: vi.fn(async () => []) }))
vi.mock('../../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => []) }))
vi.mock('../../data/queries/shiftVerifications', () => ({ listShiftVerificationsForLog: vi.fn(async () => []) }))

const { default: ProductionDataEntryScreen } = await import('./ProductionDataEntryScreen')
const { default: ManualOperationsScreen } = await import('./ManualOperationsScreen')

afterEach(cleanup)

describe.each([
  ['Production Data Entry', ProductionDataEntryScreen],
  ['Manual Operations', ManualOperationsScreen],
])('%s: open-log restore lock', (_name, Screen) => {
  it('keeps Employee and PRD disabled until the restore has finished', async () => {
    releaseOpenLogs = null
    render(createElement(Screen, { role: 'operator' }))
    // The restore is waiting on the open-log lookup.
    await waitFor(() => expect(releaseOpenLogs).toBeTypeOf('function'))
    const [employee, prd] = screen.getAllByRole('combobox')
    expect(employee.disabled).toBe(true)
    expect(prd.disabled).toBe(true)

    releaseOpenLogs([]) // no open log -> the screen unlocks
    await waitFor(() => expect(screen.getAllByRole('combobox')[1].disabled).toBe(false))
    expect(screen.getAllByRole('combobox')[0].disabled).toBe(false)
  })
})
