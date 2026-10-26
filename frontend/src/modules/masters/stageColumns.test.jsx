// @vitest-environment jsdom
// Cycle Time Master and Masters > Route Card show "Stage" (route position over
// the part's distinct seqs), never the raw "Seq". Cycle Time Master still
// edits and saves the raw seq; stage_no is display-only and never sent.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
// Native select so the test can pick a part without the combobox UI.
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options = [], disabled }) => (
    <select aria-label="searchable" value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}))

const ROWS = [
  { id: 1, part_serial_number: 'P1', operation: 'Cutting', seq: 10, type: 'Internal', machine_id: 'MC-1', cycle_time_min: 2, job_work_code: null },
  { id: 2, part_serial_number: 'P1', operation: 'Turning', seq: 25, type: 'Internal', machine_id: 'MC-1', cycle_time_min: 4, job_work_code: null },
  { id: 3, part_serial_number: 'P1', operation: 'Turning', seq: 25, type: 'Internal', machine_id: 'MC-2', cycle_time_min: 5, job_work_code: null },
  { id: 4, part_serial_number: 'P1', operation: 'Slotting', seq: 40, type: 'Internal', machine_id: 'MC-2', cycle_time_min: 3, job_work_code: null },
]
const updateCycleTime = vi.fn(async () => {})
vi.mock('../../data/queries/cycleTimes', () => ({
  listCycleTimes: vi.fn(async () => ROWS),
  createCycleTime: vi.fn(async () => {}),
  updateCycleTime: (...a) => updateCycleTime(...a),
  deleteCycleTime: vi.fn(async () => {}),
}))
vi.mock('../../data/queries/products', () => ({ listProducts: vi.fn(async () => [{ part_serial_number: 'P1', part_name: 'Shaft' }]) }))
vi.mock('../../data/queries/machines', () => ({ listMachines: vi.fn(async () => [{ machine_id: 'MC-1', machine_name: 'Saw' }, { machine_id: 'MC-2', machine_name: 'CNC' }]) }))
vi.mock('../../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: vi.fn(async () => []) }))
const exportToCsv = vi.fn()
vi.mock('../../utils/exportUtils', () => ({ exportToCsv: (...a) => exportToCsv(...a), exportToPdf: vi.fn() }))

const { default: CycleTimeMaster } = await import('./CycleTimeMaster')
const { default: RouteCardScreen } = await import('../customerOrder/RouteCardScreen')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Cycle Time Master: Stage', () => {
  it('form label Stage + hint; list and CSV use Stage (position); save sends raw seq, no stage_no', async () => {
    await act(async () => { render(<CycleTimeMaster />) })

    expect(screen.getByText('Order of this operation in the route (1, 2, 3 ...)')).toBeTruthy()
    expect(screen.queryByText('Sequence')).toBeNull()

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent.trim())
    expect(headers.some((h) => h.startsWith('Stage'))).toBe(true)
    expect(headers.some((h) => /^Seq/.test(h))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /View More/ }))
    // seq 10 / 25 / 25 / 40 -> Stage 1 / 2 / 2 / 3
    const stageCells = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[headers.findIndex((h) => h.startsWith('Stage'))]?.textContent)
    expect(stageCells).toEqual(['1', '2', '2', '3'])

    fireEvent.click(screen.getByRole('button', { name: /Print/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Excel/ }))
    const [cols, data] = exportToCsv.mock.calls[0]
    expect(cols).toContainEqual(expect.objectContaining({ key: 'stage_no', label: 'Stage' }))
    expect(cols.some((c) => c.key === 'seq')).toBe(false)
    expect(data.map((r) => r.stage_no)).toEqual([1, 2, 2, 3])

    // Open Slotting (seq 40, Stage 3), edit, save: the raw seq goes to the DB.
    fireEvent.click(screen.getByText('Slotting'))
    expect(screen.getByDisplayValue('40')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })) })
    const [id, payload] = updateCycleTime.mock.calls[0]
    expect(id).toBe(4)
    expect(payload.seq).toBe(40)
    expect(payload).not.toHaveProperty('stage_no')
  })

  it('missing Stage -> "Product, Operation, Stage and Type are required."', async () => {
    await act(async () => { render(<CycleTimeMaster />) })
    fireEvent.click(screen.getByRole('button', { name: /New/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })) })
    expect(screen.getByText('Product, Operation, Stage and Type are required.')).toBeTruthy()
  })
})

describe('Masters > Route Card: Stage only', () => {
  it('shows Stage (shared seq = shared number) and no Seq column', async () => {
    await act(async () => { render(<RouteCardScreen />) })
    fireEvent.change(screen.getAllByLabelText('searchable')[0], { target: { value: 'P1' } })
    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent.trim())
    expect(headers[0]).toBe('Stage')
    expect(headers).not.toContain('Seq')
    const firstCells = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(firstCells).toEqual(['1', '2', '2', '3'])
    expect(within(table).queryByText('25')).toBeNull()
  })
})
