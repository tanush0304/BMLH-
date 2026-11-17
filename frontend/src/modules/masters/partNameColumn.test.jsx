// @vitest-environment jsdom
// Cycle Time Master + Production Batch Master: list shows "Part Name" (from
// Product Master) next to Part Serial Number; in exports + search; never saved.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options = [], disabled }) => (
    <select aria-label="searchable" value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}))
const updateCycleTime = vi.fn(async () => {})
vi.mock('../../data/queries/cycleTimes', () => ({
  listCycleTimes: vi.fn(async () => [
    { id: 1, part_serial_number: 'P1', operation: 'Cutting', seq: 10, type: 'Internal', machine_id: 'MC-1', cycle_time_min: 2, job_work_code: null },
    { id: 2, part_serial_number: 'P2', operation: 'Turning', seq: 10, type: 'Internal', machine_id: 'MC-1', cycle_time_min: 4, job_work_code: null },
  ]),
  createCycleTime: vi.fn(async () => {}),
  updateCycleTime: (...a) => updateCycleTime(...a),
  deleteCycleTime: vi.fn(async () => {}),
}))
const updateProductionBatch = vi.fn(async () => {})
vi.mock('../../data/queries/productionBatch', () => ({
  listProductionBatches: vi.fn(async () => [
    { part_serial_number: 'P1', production_batch_quantity: 500 },
    { part_serial_number: 'P2', production_batch_quantity: 300 },
  ]),
  createProductionBatch: vi.fn(async () => {}),
  updateProductionBatch: (...a) => updateProductionBatch(...a),
  deleteProductionBatch: vi.fn(async () => {}),
}))
vi.mock('../../data/queries/products', () => ({
  listProducts: vi.fn(async () => [{ part_serial_number: 'P1', part_name: 'Shaft' }, { part_serial_number: 'P2', part_name: 'Gear Blank' }]),
}))
vi.mock('../../data/queries/machines', () => ({ listMachines: vi.fn(async () => [{ machine_id: 'MC-1', machine_name: 'Saw' }]) }))
vi.mock('../../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: vi.fn(async () => []) }))
const exportToCsv = vi.fn()
vi.mock('../../utils/exportUtils', () => ({ exportToCsv: (...a) => exportToCsv(...a), exportToPdf: vi.fn() }))

const { default: CycleTimeMaster } = await import('./CycleTimeMaster')
const { default: ProductionBatchMaster } = await import('./ProductionBatchMaster')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const table = () => screen.getAllByRole('table').at(-1)
const headers = () => within(table()).getAllByRole('columnheader').map((h) => h.textContent.trim())
const column = (label) => {
  const i = headers().indexOf(label)
  return within(table()).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[i]?.textContent)
}
async function exportCsv() {
  fireEvent.click(screen.getByRole('button', { name: /Print/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Excel/ }))
  return exportToCsv.mock.calls[0]
}

describe.each([
  ['Cycle Time Master', CycleTimeMaster, 'Turning'],
  ['Production Batch Master', ProductionBatchMaster, '300'],
])('%s: Part Name column', (_name, Screen, p2Text) => {
  it('Part Name right after Part Serial Number, filled from Product Master; in CSV; searchable', async () => {
    await act(async () => { render(<Screen />) })
    const h = headers()
    expect(h[h.indexOf('Part Serial Number') + 1]).toBe('Part Name')
    expect(column('Part Name')).toEqual(['Shaft', 'Gear Blank'])

    const [cols, data] = await exportCsv()
    expect(cols).toContainEqual({ key: 'part_name', label: 'Part Name' })
    expect(data.map((r) => r.part_name)).toEqual(['Shaft', 'Gear Blank'])

    fireEvent.change(screen.getByPlaceholderText(/Part Name/), { target: { value: 'gear' } })
    expect(column('Part Name')).toEqual(['Gear Blank'])
    expect(screen.getByText(p2Text)).toBeTruthy()
  })
})

describe('Part Name is display only', () => {
  it('Cycle Time edit payload has no part_name', async () => {
    await act(async () => { render(<CycleTimeMaster />) })
    fireEvent.click(screen.getByText('Cutting'))
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })) })
    expect(updateCycleTime.mock.calls[0][1]).not.toHaveProperty('part_name')
  })

  it('Production Batch edit payload has no part_name', async () => {
    await act(async () => { render(<ProductionBatchMaster />) })
    fireEvent.click(screen.getByText('500'))
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })) })
    expect(updateProductionBatch).toHaveBeenCalled()
    expect(updateProductionBatch.mock.calls[0][1]).not.toHaveProperty('part_name')
  })
})
