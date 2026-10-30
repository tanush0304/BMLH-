// @vitest-environment jsdom
// Checklist Entry: items filtered by the machine + Type of Maintenance
// (frequency, trim / case-insensitive), tick box -> OK / Not OK, and a Daily
// visit opened instead of duplicated for the same machine + date + shift.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }))
const q = vi.hoisted(() => ({
  listChecklistItemsForMachine: vi.fn(),
  createMaintenanceLog: vi.fn(),
  addMaintenanceLogItem: vi.fn(),
  listRecentMaintenanceLogs: vi.fn(),
  listMaintenanceLogItems: vi.fn(),
  updateMaintenanceLog: vi.fn(),
  updateMaintenanceLogItem: vi.fn(),
  listMaintenanceLogsForShift: vi.fn(),
}))
vi.mock('../../data/queries/maintenanceLogs', () => q)
vi.mock('../../data/queries/machines', () => ({ listMachines: async () => [{ machine_id: 'MC-1', machine_name: 'Lathe' }] }))
vi.mock('../../data/queries/employees', () => ({ listEmployees: async () => [{ employee_id: 'EMP-1', employee_name: 'Ravi' }] }))
vi.mock('../../data/queries/shifts', () => ({ listShifts: async () => [{ shift_code: 'A' }] }))
vi.mock('../../data/queries/appUsers', () => ({ listAppUsers: async () => [] }))
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options, disabled }) => (
    <select value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {(options ?? []).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}))

import ChecklistEntryScreen from './ChecklistEntryScreen'

const ITEMS = [
  { id: 1, machine_id: 'MC-1', checklist_item: 'Oil level', frequency: 'Daily' },
  { id: 2, machine_id: 'MC-1', checklist_item: 'Coolant', frequency: ' DAILY ' },
  { id: 3, machine_id: 'MC-1', checklist_item: 'Belt tension', frequency: 'Weekly' },
]

beforeEach(() => {
  Object.values(q).forEach((f) => f.mockReset())
  q.listChecklistItemsForMachine.mockResolvedValue(ITEMS)
  q.listRecentMaintenanceLogs.mockResolvedValue([])
  q.listMaintenanceLogsForShift.mockResolvedValue([])
  q.listMaintenanceLogItems.mockResolvedValue([])
  q.createMaintenanceLog.mockResolvedValue({ id: 70 })
  q.addMaintenanceLogItem.mockResolvedValue({})
})
afterEach(() => cleanup())

async function pick({ type }) {
  render(<ChecklistEntryScreen role="supervisor" />)
  await screen.findByRole('option', { name: 'Lathe (MC-1)' })
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[0], { target: { value: 'MC-1' } }) // machine
  await waitFor(() => expect(q.listChecklistItemsForMachine).toHaveBeenCalledWith('MC-1'))
  fireEvent.change(selects[1], { target: { value: 'EMP-1' } }) // engineer
  fireEvent.change(selects[2], { target: { value: 'A' } }) // shift
  fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '2026-10-28' } })
  fireEvent.change(selects[3], { target: { value: type } }) // type of maintenance
}

describe('Checklist Entry', () => {
  it('shows only the items whose frequency matches the type, as tick boxes', async () => {
    await pick({ type: 'Daily' })
    fireEvent.click(screen.getByRole('button', { name: /Start Visit/ }))
    await screen.findByText('Oil level')
    expect(screen.getByText('Coolant')).toBeTruthy()
    expect(screen.queryByText('Belt tension')).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('no match -> the add-them-in-the-master message', async () => {
    await pick({ type: 'Monthly' })
    expect(await screen.findByText('No Monthly checklist items for Lathe (MC-1) -- add them in Maintenance Master.')).toBeTruthy()
  })

  it('saves ticked = OK and unticked = Not OK', async () => {
    await pick({ type: 'Daily' })
    fireEvent.click(screen.getByRole('button', { name: /Start Visit/ }))
    await screen.findByText('Oil level')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: /Save Checklist/ }))
    await waitFor(() => expect(q.addMaintenanceLogItem).toHaveBeenCalledTimes(2))
    expect(q.addMaintenanceLogItem.mock.calls.map(([p]) => [p.checklist_item_id, p.condition])).toEqual([
      [1, 'OK'],
      [2, 'Not OK'],
    ])
  })

  it('a Daily visit for the same machine + date + shift is opened, not duplicated', async () => {
    q.listMaintenanceLogsForShift.mockResolvedValue([{ id: 40, machine_id: 'MC-1', log_date: '2026-10-28', shift_code: 'A', maintenance_type: 'daily' }])
    q.listMaintenanceLogItems.mockResolvedValue([{ checklist_item_id: 1, condition: 'OK' }])
    await pick({ type: 'Daily' })
    fireEvent.click(screen.getByRole('button', { name: /Start Visit/ }))
    await screen.findByText('Oil level')
    expect(q.listMaintenanceLogsForShift).toHaveBeenCalledWith('MC-1', '2026-10-28', 'A')
    expect(q.createMaintenanceLog).not.toHaveBeenCalled()
    const [oil, coolant] = screen.getAllByRole('checkbox')
    expect(oil.checked).toBe(true)
    expect(oil.disabled).toBe(true) // already saved
    expect(coolant.disabled).toBe(false)
  })

  it('a Weekly visit is created as before (no Daily lookup)', async () => {
    await pick({ type: 'Weekly' })
    fireEvent.click(screen.getByRole('button', { name: /Start Visit/ }))
    await waitFor(() => expect(q.createMaintenanceLog).toHaveBeenCalledTimes(1))
    expect(q.listMaintenanceLogsForShift).not.toHaveBeenCalled()
  })
})

describe('Checklist Entry -- untagged items (frequency blank / NULL)', () => {
  const MIXED = [...ITEMS, { id: 4, machine_id: 'MC-1', checklist_item: 'Clean chips', frequency: null }, { id: 5, machine_id: 'MC-1', checklist_item: 'Lube', frequency: '  ' }]

  it('show under every type with a "(no frequency set)" note; tagged items only under their type', async () => {
    q.listChecklistItemsForMachine.mockResolvedValue(MIXED)
    await pick({ type: 'Weekly' })
    fireEvent.click(screen.getByRole('button', { name: /Start Visit/ }))
    await screen.findByText('Belt tension')
    expect(screen.getByText('Clean chips')).toBeTruthy()
    expect(screen.getByText('Lube')).toBeTruthy()
    expect(screen.queryByText('Oil level')).toBeNull()
    expect(screen.getAllByText('(no frequency set)')).toHaveLength(2)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('a type with no tagged match still shows the untagged items and no "No ... items" message', async () => {
    q.listChecklistItemsForMachine.mockResolvedValue(MIXED)
    await pick({ type: 'Monthly' })
    await waitFor(() => expect(screen.queryByText(/No Monthly checklist items/)).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /Start Visit/ }))
    await screen.findByText('Clean chips')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('all items untagged (live today): shown under Daily, each with the note', async () => {
    q.listChecklistItemsForMachine.mockResolvedValue(MIXED.filter((i) => !String(i.frequency ?? '').trim()))
    await pick({ type: 'Daily' })
    expect(screen.queryByText(/No Daily checklist items/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Start Visit/ }))
    await screen.findByText('Clean chips')
    expect(screen.getAllByText('(no frequency set)')).toHaveLength(2)
  })
})

describe('Checklist Entry -- live D / W / M codes', () => {
  it('items coded D show under Daily, W / M items do not; no "(no frequency set)" note', async () => {
    q.listChecklistItemsForMachine.mockResolvedValue([
      { id: 11, machine_id: 'MC-1', checklist_item: 'Machine Cleaning', frequency: 'D' },
      { id: 12, machine_id: 'MC-1', checklist_item: 'Lubrication Pressure', frequency: 'W' },
      { id: 13, machine_id: 'MC-1', checklist_item: 'Overhaul the Chuck', frequency: 'M' },
    ])
    await pick({ type: 'Daily' })
    fireEvent.click(screen.getByRole('button', { name: /Start Visit/ }))
    await screen.findByText('Machine Cleaning')
    expect(screen.queryByText('Lubrication Pressure')).toBeNull()
    expect(screen.queryByText('Overhaul the Chuck')).toBeNull()
    expect(screen.queryByText('(no frequency set)')).toBeNull()
  })
})
