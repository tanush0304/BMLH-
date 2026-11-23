// @vitest-environment jsdom
// The single Cycle Time Master form sends EXACTLY the same payload as before
// the bulk-entry refactor (buildCycleTimePayload in utils/cycleTimeBulk.js).
// Expected objects captured from the form before the refactor -- toEqual.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({ create: vi.fn(async (p) => ({ id: 9, ...p })), records: [] }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../data/queries/cycleTimes', () => ({
  listCycleTimes: async () => m.records,
  createCycleTime: m.create,
  createCycleTimes: vi.fn(),
  updateCycleTime: vi.fn(),
  deleteCycleTime: vi.fn(),
}))
vi.mock('../../data/queries/products', () => ({ listProducts: async () => [{ part_serial_number: 'P1', part_name: 'Shaft' }] }))
vi.mock('../../data/queries/machines', () => ({ listMachines: async () => [{ machine_id: 'MC-1', machine_name: 'Saw' }] }))
vi.mock('../../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: async () => [{ job_work_code: 'HT', type_of_job_work: 'Heat Treatment' }] }))
vi.mock('../../data/queries/machineOperations', () => ({ listAllMachineOperations: async () => [] }))
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options = [], disabled }) => (
    <select data-testid="ss" value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        return <option key={v} value={v}>{typeof o === 'string' ? o : o.label}</option>
      })}
    </select>
  ),
}))
import CycleTimeMaster from './CycleTimeMaster'

const selectWith = (value) => screen.getAllByTestId('ss').find((el) => [...el.options].some((o) => o.value === value))
const field = (label) => screen.getByText(label, { selector: 'span' }).closest('label').querySelector('input, select')
const set = (el, value) => fireEvent.change(el, { target: { value } })

async function fill({ seq, op, type }) {
  render(<CycleTimeMaster />)
  await waitFor(() => expect(selectWith('P1')).toBeTruthy())
  set(selectWith('P1'), 'P1')
  set(field('Stage'), seq)
  set(field('Operation'), op)
  set(field('Type'), type)
}
async function save() {
  fireEvent.click(screen.getByRole('button', { name: /^save/i }))
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1))
  return m.create.mock.calls[0][0]
}

beforeEach(() => { m.create.mockClear(); m.records = [] })
afterEach(() => cleanup())

describe('Cycle Time single form payload (unchanged by the bulk refactor)', () => {
  it('Internal', async () => {
    await fill({ seq: '2', op: ' Turning ', type: 'Internal' })
    set(selectWith('MC-1'), 'MC-1')
    set(field('Cycle Time (min)'), '1.5')
    expect(await save()).toEqual({
      part_serial_number: 'P1', operation: 'Turning', seq: 2, type: 'Internal', machine_id: 'MC-1', job_work_code: null, cycle_time_min: 1.5,
    })
  })

  it('Outsourced, blank cycle time -> null', async () => {
    await fill({ seq: '3', op: 'Hardening', type: 'Outsourced' })
    set(selectWith('HT'), 'HT')
    expect(await save()).toEqual({
      part_serial_number: 'P1', operation: 'Hardening', seq: 3, type: 'Outsourced', machine_id: null, job_work_code: 'HT', cycle_time_min: null,
    })
  })

  it('Manual', async () => {
    await fill({ seq: '4', op: 'Deburr', type: 'Manual' })
    set(field('Cycle Time (min)'), '2')
    expect(await save()).toEqual({
      part_serial_number: 'P1', operation: 'Deburr', seq: 4, type: 'Manual', machine_id: null, job_work_code: null, cycle_time_min: 2,
    })
  })

  it('single form keeps no duplicate check (bulk only): an identical saved row does not block', async () => {
    m.records = [{ id: 1, part_serial_number: 'P1', operation: 'Deburr', seq: 4, type: 'Manual', machine_id: null, job_work_code: null }]
    await fill({ seq: '4', op: 'Deburr', type: 'Manual' })
    expect(await save()).toMatchObject({ seq: 4 })
  })
})
