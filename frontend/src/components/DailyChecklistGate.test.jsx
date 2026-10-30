// @vitest-environment jsdom
// Daily checklist gate on Production Data Entry: panel when none saved this
// shift, one save (unticked = Not OK), then done / Not OK line.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const q = vi.hoisted(() => ({
  listChecklistItemsForMachine: vi.fn(),
  listMaintenanceLogsForShift: vi.fn(),
  listMaintenanceLogItems: vi.fn(),
  createMaintenanceLog: vi.fn(),
  addMaintenanceLogItem: vi.fn(),
}))
vi.mock('../data/queries/maintenanceLogs', () => q)
vi.mock('../utils/dates', async (orig) => ({ ...(await orig()), todayISO: () => '2026-10-28' }))

import DailyChecklistGate from './DailyChecklistGate'

const ITEMS = [
  { id: 1, machine_id: 'MC-SUB', checklist_item: 'Oil level', frequency: 'Daily' },
  { id: 2, machine_id: 'MC-SUB', checklist_item: 'Air pressure', frequency: ' daily' },
  { id: 3, machine_id: 'MC-SUB', checklist_item: 'Belt', frequency: 'Weekly' },
]
const EMPLOYEES = [{ employee_id: 'EMP-1', employee_name: 'Ravi' }]

beforeEach(() => {
  q.listChecklistItemsForMachine.mockReset().mockResolvedValue(ITEMS)
  q.listMaintenanceLogsForShift.mockReset().mockResolvedValue([])
  q.listMaintenanceLogItems.mockReset().mockResolvedValue([])
  q.createMaintenanceLog.mockReset().mockResolvedValue({ id: 50, machine_id: 'MC-SUB', employee_id: 'EMP-1', created_at: '2026-10-28T09:15:00Z' })
  q.addMaintenanceLogItem.mockReset().mockImplementation(async (p) => ({ id: 100 + p.checklist_item_id, ...p }))
})
afterEach(() => cleanup())

function renderGate(onStatusChange = vi.fn()) {
  render(<DailyChecklistGate machineId="MC-SUB" machineLabel="Sub Lathe (MC-SUB)" shiftCode="A" employeeId="EMP-1" employees={EMPLOYEES} onStatusChange={onStatusChange} />)
  return onStatusChange
}

describe('DailyChecklistGate', () => {
  it('looks up the chosen (substitute) machine for today + the picked shift and shows only Daily items', async () => {
    const status = renderGate()
    expect(await screen.findByText('Daily Checklist – Sub Lathe (MC-SUB) (Shift A)')).toBeTruthy()
    expect(q.listChecklistItemsForMachine).toHaveBeenCalledWith('MC-SUB')
    expect(q.listMaintenanceLogsForShift).toHaveBeenCalledWith('MC-SUB', '2026-10-28', 'A')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.queryByText('Belt')).toBeNull()
    expect(screen.getByText('All checklist items must be ticked before production can start.')).toBeTruthy()
    expect(status).toHaveBeenLastCalledWith('pending')
  })

  it('saves once with unticked = Not OK, then shows the supervisor message', async () => {
    const status = renderGate()
    await screen.findByText('Oil level')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'ZZ-QA low pressure' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Checklist' }))
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('not-ok'))
    expect(q.createMaintenanceLog).toHaveBeenCalledWith({ machine_id: 'MC-SUB', employee_id: 'EMP-1', shift_code: 'A', log_date: '2026-10-28', maintenance_type: 'Daily' })
    expect(q.addMaintenanceLogItem.mock.calls.map(([p]) => [p.checklist_item_id, p.condition, p.observation])).toEqual([
      [1, 'OK', null],
      [2, 'Not OK', 'ZZ-QA low pressure'],
    ])
    expect(screen.getByText('Daily checklist for Sub Lathe (MC-SUB) has Not OK items -- a supervisor must clear them before production can start.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save Checklist' })).toBeNull()
  })

  it('all ticked -> "done" line with who saved it', async () => {
    const status = renderGate()
    await screen.findByText('Oil level')
    screen.getAllByRole('checkbox').forEach((c) => fireEvent.click(c))
    fireEvent.click(screen.getByRole('button', { name: 'Save Checklist' }))
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('done'))
    expect(screen.getByTestId('daily-checklist').textContent).toMatch(/✓ Daily checklist done \(by .*Ravi.*, .+\)/)
  })

  it('an existing checklist this shift shows only its state (no duplicate save)', async () => {
    q.listMaintenanceLogsForShift.mockResolvedValue([{ id: 40, machine_id: 'MC-SUB', log_date: '2026-10-28', shift_code: 'A', maintenance_type: 'Daily', employee_id: 'EMP-1', created_at: '2026-10-28T08:00:00Z' }])
    q.listMaintenanceLogItems.mockResolvedValue([{ checklist_item_id: 1, condition: 'OK' }, { checklist_item_id: 2, condition: 'OK' }])
    const status = renderGate()
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('done'))
    expect(q.listMaintenanceLogItems).toHaveBeenCalledWith(40)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(q.createMaintenanceLog).not.toHaveBeenCalled()
  })

  it('existing checklist with a Not OK item stays blocked', async () => {
    q.listMaintenanceLogsForShift.mockResolvedValue([{ id: 40, machine_id: 'MC-SUB', log_date: '2026-10-28', shift_code: 'A', maintenance_type: 'Daily' }])
    q.listMaintenanceLogItems.mockResolvedValue([{ checklist_item_id: 1, condition: 'OK' }, { checklist_item_id: 2, condition: 'Not OK' }])
    const status = renderGate()
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('not-ok'))
  })

  it('no Daily items in the master -> message and Start allowed', async () => {
    q.listChecklistItemsForMachine.mockResolvedValue([ITEMS[2]])
    const status = renderGate()
    expect(await screen.findByText('No Daily checklist items set for Sub Lathe (MC-SUB) -- ask maintenance to add them')).toBeTruthy()
    expect(status).toHaveBeenLastCalledWith('no-items')
  })
})

describe('DailyChecklistGate -- only items tagged Daily count', () => {
  it('untagged items do not trigger the gate: "No Daily checklist items set" and Start allowed', async () => {
    q.listChecklistItemsForMachine.mockResolvedValue([
      { id: 7, machine_id: 'MC-SUB', checklist_item: 'Clean chips', frequency: null },
      { id: 8, machine_id: 'MC-SUB', checklist_item: 'Lube', frequency: '' },
      { id: 9, machine_id: 'MC-SUB', checklist_item: 'Belt', frequency: 'Weekly' },
    ])
    const onStatusChange = renderGate()
    expect(await screen.findByText('No Daily checklist items set for Sub Lathe (MC-SUB) -- ask maintenance to add them')).toBeTruthy()
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith('no-items'))
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('a mix: the panel lists only the Daily-tagged items', async () => {
    q.listChecklistItemsForMachine.mockResolvedValue([...ITEMS, { id: 7, machine_id: 'MC-SUB', checklist_item: 'Clean chips', frequency: null }])
    renderGate()
    await screen.findByText('Oil level')
    expect(screen.queryByText('Clean chips')).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })
})
