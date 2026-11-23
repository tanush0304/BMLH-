// @vitest-environment jsdom
// Cycle Time Master "Add Multiple Stages": grid, per-row errors, duplicates
// (stage + target), machine capability, blank rows ignored, ONE insert call,
// DB refusal keeps rows + names the row, note, leave warnings.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const m = vi.hoisted(() => ({
  createMany: vi.fn(),
  create: vi.fn(),
  records: [],
  ops: [{ machine_id: 'MC-1', operation: 'Cutting' }],
  opsFail: false,
}))
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../data/queries/cycleTimes', () => ({
  listCycleTimes: async () => m.records,
  createCycleTime: m.create,
  createCycleTimes: m.createMany,
  updateCycleTime: vi.fn(),
  deleteCycleTime: vi.fn(),
}))
vi.mock('../../data/queries/machineOperations', () => ({
  listAllMachineOperations: async () => { if (m.opsFail) throw new Error('boom'); return m.ops },
}))
vi.mock('../../data/queries/products', () => ({
  listProducts: async () => [{ part_serial_number: 'P1', part_name: 'Shaft', part_drawing_reference_number: 'DRG-1' }],
}))
vi.mock('../../data/queries/machines', () => ({
  listMachines: async () => [{ machine_id: 'MC-1', machine_name: 'Saw' }, { machine_id: 'MC-2', machine_name: 'Lathe' }],
}))
vi.mock('../../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: async () => [{ job_work_code: 'HT', type_of_job_work: 'Heat Treatment' }] }))
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

const cell = (n, col) => screen.getByLabelText(`Row ${n} ${col}`)
const set = (n, col, value) => fireEvent.change(cell(n, col), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: /^save/i }))
const gridRows = () => screen.getAllByTestId(/^stage-row-\d+$/)
const partSelect = () => screen.getAllByTestId('ss').find((el) => [...el.options].some((o) => o.value === 'P1'))

async function openBulk() {
  render(<CycleTimeMaster />)
  await waitFor(() => expect(partSelect()).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Add Multiple Stages' }))
  await waitFor(() => cell(1, 'Stage'))
}
function pickPart() {
  fireEvent.change(partSelect(), { target: { value: 'P1' } })
}
function step(n, { seq, op, type, mc, jw, ct }) {
  set(n, 'Stage', seq)
  set(n, 'Operation', op)
  set(n, 'Type', type)
  if (mc) set(n, 'Machine', mc)
  if (jw) set(n, 'Job Work', jw)
  if (ct) set(n, 'Cycle Time', ct)
}

beforeEach(() => {
  m.records = []
  m.ops = [{ machine_id: 'MC-1', operation: 'Cutting' }]
  m.opsFail = false
  m.create.mockClear()
  m.createMany.mockReset().mockImplementation(async (rows) => rows.map((r, i) => ({ id: 100 + i, ...r })))
})
afterEach(() => cleanup())

describe('Add Multiple Stages', () => {
  it('part once (name + drawing read-only), 5 rows, + Add row / Remove, note shown', async () => {
    await openBulk()
    pickPart()
    expect(screen.getByText('Shaft')).toBeTruthy()
    expect(screen.getByText('DRG-1')).toBeTruthy()
    expect(gridRows()).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: /add row/i }))
    expect(gridRows()).toHaveLength(6)
    set(2, 'Operation', 'keep')
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }))
    expect(gridRows()).toHaveLength(5)
    expect(cell(1, 'Operation').value).toBe('keep')
    expect(screen.getByTestId('bulk-stage-note').textContent).toContain('Changes apply to new PRDs only; existing route cards keep their stages.')
  })

  it('all-blank grid refused', async () => {
    await openBulk()
    pickPart()
    save()
    expect(await screen.findByText('Enter at least one stage.')).toBeTruthy()
    expect(m.createMany).not.toHaveBeenCalled()
  })

  it('Type enables only its field and clears the other', async () => {
    await openBulk()
    set(1, 'Type', 'Internal')
    expect(cell(1, 'Machine').disabled).toBe(false)
    expect(cell(1, 'Job Work').disabled).toBe(true)
    set(1, 'Machine', 'MC-1')
    set(1, 'Type', 'Outsourced')
    expect(cell(1, 'Machine').value).toBe('')
    expect(cell(1, 'Job Work').disabled).toBe(false)
  })

  it('per-row errors under rows (required, Outsourced job work, capability, duplicates); nothing saved', async () => {
    m.records = [{ id: 1, part_serial_number: 'P1', seq: 9, type: 'Manual', operation: 'Wash', machine_id: null }]
    await openBulk()
    pickPart()
    step(1, { seq: '1', op: 'Cutting', type: 'Internal', mc: 'MC-1' }) // fine
    step(2, { seq: '2', op: 'Hardening', type: 'Outsourced' }) // no job work
    step(3, { seq: '3', op: 'Grinding', type: 'Internal', mc: 'MC-1' }) // MC-1 not set up for it
    step(4, { seq: '9', op: 'Wash again', type: 'Manual' }) // stage 9 Manual exists
    step(5, { seq: '3', op: 'Grinding', type: 'Internal', mc: 'MC-2' }) // MC-2 has no ops: not checked
    save()
    expect((await screen.findByTestId('stage-row-error-2')).textContent).toBe('Job Work Type is required for an Outsourced step.')
    expect(screen.getByTestId('stage-row-error-3').textContent).toBe("MC-1 is not set up for 'Grinding' in Machine Master (Machine Operations).")
    expect(screen.getByTestId('stage-row-error-4').textContent).toBe('Stage 9 (Manual) already exists for P1 -- edit it instead.')
    expect(screen.queryByTestId('stage-row-error-1')).toBeNull()
    expect(screen.queryByTestId('stage-row-error-5')).toBeNull()
    expect(screen.getByTestId('stage-row-3').getAttribute('data-invalid')).toBe('true')
    expect(screen.getByText('3 rows have problems -- fix them and save again.')).toBeTruthy()
    expect(m.createMany).not.toHaveBeenCalled()
  })

  it('same stage + same machine twice is refused; alternative machines on one stage are fine', async () => {
    await openBulk()
    pickPart()
    step(1, { seq: '1', op: 'Cutting', type: 'Internal', mc: 'MC-1' })
    step(2, { seq: '1', op: 'Cutting', type: 'Internal', mc: 'MC-1' })
    step(3, { seq: '1', op: 'Cutting', type: 'Internal', mc: 'MC-2' })
    save()
    expect((await screen.findByTestId('stage-row-error-1')).textContent).toBe('Stage 1 on MC-1 is entered more than once in this grid.')
    expect(screen.getByTestId('stage-row-error-2').textContent).toBe('Stage 1 on MC-1 is entered more than once in this grid.')
    expect(screen.queryByTestId('stage-row-error-3')).toBeNull()
  })

  it('blank rows ignored; ONE insert with exact payloads; single insert not used', async () => {
    await openBulk()
    pickPart()
    step(1, { seq: '1', op: ' Cutting ', type: 'Internal', mc: 'MC-1', ct: '1.5' })
    step(3, { seq: '2', op: 'Hardening', type: 'Outsourced', jw: 'HT' })
    step(4, { seq: '3', op: 'Deburr', type: 'Manual', ct: '2' })
    save()
    await waitFor(() => expect(m.createMany).toHaveBeenCalledTimes(1))
    expect(m.create).not.toHaveBeenCalled()
    expect(m.createMany.mock.calls[0][0]).toEqual([
      { part_serial_number: 'P1', operation: 'Cutting', seq: 1, type: 'Internal', machine_id: 'MC-1', job_work_code: null, cycle_time_min: 1.5 },
      { part_serial_number: 'P1', operation: 'Hardening', seq: 2, type: 'Outsourced', machine_id: null, job_work_code: 'HT', cycle_time_min: null },
      { part_serial_number: 'P1', operation: 'Deburr', seq: 3, type: 'Manual', machine_id: null, job_work_code: null, cycle_time_min: 2 },
    ])
    expect(await screen.findByText('3 stages saved for P1.')).toBeTruthy()
    expect(cell(1, 'Operation').value).toBe('')
  })

  it('DB refusal naming one row: "Row N (Stage s – op)", row marked, rows stay', async () => {
    m.createMany.mockImplementation(async () => {
      throw Object.assign(new Error('new row violates check constraint "cycle_times_check"'), { details: 'Failing row contains (P1, Deburr, 3, Manual, ...)' })
    })
    await openBulk()
    pickPart()
    step(1, { seq: '1', op: 'Cutting', type: 'Internal', mc: 'MC-1' })
    step(2, { seq: '3', op: 'Deburr', type: 'Manual' })
    save()
    expect(await screen.findByText(/^Row 2 \(Stage 3 – Deburr\): new row violates check constraint/)).toBeTruthy()
    expect(screen.getByTestId('stage-row-2').getAttribute('data-invalid')).toBe('true')
    expect(cell(1, 'Operation').value).toBe('Cutting')
    expect(cell(2, 'Operation').value).toBe('Deburr')
  })

  it('DB refusal not naming a row: plain message, rows stay', async () => {
    m.createMany.mockImplementation(async () => { throw new Error('new row violates row-level security policy for table "cycle time master"') })
    await openBulk()
    pickPart()
    step(1, { seq: '1', op: 'Cutting', type: 'Internal', mc: 'MC-1' })
    save()
    expect(await screen.findByText('You do not have permission to make this change.')).toBeTruthy()
    expect(cell(1, 'Operation').value).toBe('Cutting')
  })

  it('Machine Operations failed to load: save refused (capability cannot be checked)', async () => {
    m.opsFail = true
    await openBulk()
    pickPart()
    step(1, { seq: '1', op: 'Cutting', type: 'Internal', mc: 'MC-1' })
    save()
    expect(await screen.findByText(/Could not load Machine Operations \(boom\)/)).toBeTruthy()
    expect(m.createMany).not.toHaveBeenCalled()
  })

  it('leave warnings with typed rows: Back / New / list row; Keep editing stays, Discard leaves', async () => {
    m.records = [{ id: 1, part_serial_number: 'P1', seq: 1, type: 'Internal', operation: 'Cutting', machine_id: 'MC-1' }]
    await openBulk()
    set(2, 'Operation', 'typed')

    fireEvent.click(screen.getByRole('button', { name: /back to single stage/i }))
    let dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Discard the typed stages?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(cell(2, 'Operation').value).toBe('typed')

    fireEvent.click(screen.getByRole('button', { name: /^new/i }))
    dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

    fireEvent.click(await screen.findByText('Cutting', { selector: 'td' }))
    dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByLabelText('Row 1 Stage')).toBeNull())
    expect(screen.getByRole('button', { name: /^Edit/ })).toBeTruthy()
  })

  it('empty grid: Back leaves without a warning', async () => {
    await openBulk()
    fireEvent.click(screen.getByRole('button', { name: /back to single stage/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByLabelText('Row 1 Stage')).toBeNull()
  })

  it('tab close with typed rows: beforeunload is prevented; none when empty', async () => {
    await openBulk()
    const ev1 = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev1)
    expect(ev1.defaultPrevented).toBe(false)
    set(1, 'Operation', 'typed')
    const ev2 = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev2)
    expect(ev2.defaultPrevented).toBe(true)
  })
})
