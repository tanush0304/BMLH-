// @vitest-environment jsdom
// Quality Master "Add Multiple Parameters": grid, per-row errors, duplicates,
// blank rows ignored, ONE insert call, DB refusal keeps rows, Job Work = Gauge, leave warnings.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const m = vi.hoisted(() => ({
  createMany: vi.fn(async (rows) => rows.map((r, i) => ({ id: 100 + i, ...r }))),
  create: vi.fn(),
  records: [],
}))
vi.mock('../../data/queries/qualityParameters', () => ({
  listQualityParameters: async () => m.records,
  createQualityParameter: m.create,
  createQualityParameters: m.createMany,
  updateQualityParameter: vi.fn(),
  deleteQualityParameter: vi.fn(),
  qualityCategorySupported: async () => true,
  qualityCheckTypeSupported: async () => true,
  qualityGaugeStandardSupported: async () => true,
  parameterHasReadings: async () => false,
}))
vi.mock('../../data/queries/jobworkQc', () => ({ qualityReceiptSupported: async () => true }))
vi.mock('../../data/queries/jobWorkTypes', () => ({
  listJobWorkTypes: async () => [{ job_work_code: 'HT', type_of_job_work: 'Heat Treatment' }],
}))
vi.mock('../../data/queries/products', () => ({
  listProducts: async () => [{ part_serial_number: 'P1', part_name: 'Shaft' }, { part_serial_number: 'P2', part_name: 'Pin' }],
}))
vi.mock('../../data/queries/machines', () => ({
  listMachines: async () => [{ machine_id: 'MC-004', machine_name: 'CNC 1', category: 'CNC' }],
}))
vi.mock('../../data/queries/cycleTimes', () => ({
  listCycleTimes: async () => [
    { part_serial_number: 'P1', machine_id: 'MC-004', operation: 'Rough Turning' },
    { part_serial_number: 'P2', machine_id: 'MC-004', operation: 'Facing' },
    { part_serial_number: 'P1', machine_id: null, operation: 'Toughening', type: 'Outsourced', job_work_code: 'HT' },
  ],
}))
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options, disabled }) => (
    <select data-testid="ss" value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {(options ?? []).map((o) => {
        const v = typeof o === 'string' ? o : o.value
        return <option key={v} value={v}>{typeof o === 'string' ? o : o.label}</option>
      })}
    </select>
  ),
}))
import QualityMaster from './QualityMaster'

const selectWith = (value) => screen.getAllByTestId('ss').find((el) => [...el.options].some((o) => o.value === value))
const pick = (el, value) => fireEvent.change(el, { target: { value } })
const cell = (n, col) => screen.getByLabelText(`Row ${n} ${col}`)
const type = (n, col, value) => fireEvent.change(cell(n, col), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: /^save/i }))
const gridRows = () => screen.getAllByTestId(/^bulk-row-\d+$/)

async function openBulk() {
  render(<QualityMaster />)
  await waitFor(() => screen.getByRole('radio', { name: 'Job Work' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Multiple Parameters' }))
  await waitFor(() => screen.getByLabelText('Row 1 Parameter'))
}
function pickCategoryTarget(part = 'P1', op = 'Rough Turning') {
  pick(selectWith(part), part)
  pick(selectWith('CNC'), 'CNC')
  pick(selectWith(op), op)
}

beforeEach(() => {
  m.records = []
  m.createMany.mockClear()
  m.createMany.mockImplementation(async (rows) => rows.map((r, i) => ({ id: 100 + i, ...r })))
  m.create.mockClear()
})
afterEach(() => cleanup())

describe('Add Multiple Parameters', () => {
  it('starts with 5 empty rows; + Add row and Remove row', async () => {
    await openBulk()
    expect(gridRows()).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: /add row/i }))
    expect(gridRows()).toHaveLength(6)
    type(2, 'Parameter', 'keep')
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }))
    expect(gridRows()).toHaveLength(5)
    expect(cell(1, 'Parameter').value).toBe('keep')
  })

  it('all-blank grid refused: "Enter at least one parameter."', async () => {
    await openBulk()
    pickCategoryTarget()
    save()
    expect(await screen.findByText('Enter at least one parameter.')).toBeTruthy()
    expect(m.createMany).not.toHaveBeenCalled()
  })

  it('per-row errors shown under their rows; nothing saved', async () => {
    await openBulk()
    pickCategoryTarget()
    type(1, 'Parameter', 'OD')
    type(1, 'Standard', '50')
    type(2, 'Parameter', 'ID') // no Standard
    type(3, 'Parameter', 'Len')
    type(3, 'Standard', '10')
    type(3, 'Upper Tol', '-1')
    save()
    expect(await screen.findByTestId('bulk-row-error-2')).toHaveProperty('textContent', 'Standard is required.')
    expect(screen.getByTestId('bulk-row-error-3').textContent).toMatch(/Upper Tolerance/)
    expect(screen.queryByTestId('bulk-row-error-1')).toBeNull()
    expect(screen.getByTestId('bulk-row-2').getAttribute('data-invalid')).toBe('true')
    expect(screen.getByText('2 rows have problems -- fix them and save again.')).toBeTruthy()
    expect(m.createMany).not.toHaveBeenCalled()
  })

  it('duplicates: within the grid and already in the master', async () => {
    m.records = [{ id: 1, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50 }]
    await openBulk()
    pickCategoryTarget()
    type(1, 'Parameter', ' od ')
    type(1, 'Standard', '1')
    type(2, 'Parameter', 'Len')
    type(2, 'Standard', '2')
    type(3, 'Parameter', 'LEN')
    type(3, 'Standard', '3')
    save()
    expect((await screen.findByTestId('bulk-row-error-1')).textContent).toBe('OD is already defined for P1 – Rough Turning on CNC (all) -- edit it instead.')
    expect(screen.getByTestId('bulk-row-error-2').textContent).toBe('Len is entered more than once in this grid.')
    expect(screen.getByTestId('bulk-row-error-3').textContent).toBe('LEN is entered more than once in this grid.')
    expect(m.createMany).not.toHaveBeenCalled()
  })

  it('blank rows ignored; ONE insert call with every row; single-form insert not used', async () => {
    await openBulk()
    pickCategoryTarget()
    type(1, 'Parameter', 'OD')
    type(1, 'Standard', '50')
    type(1, 'Upper Tol', '0.1')
    type(3, 'Parameter', 'Thread')
    fireEvent.change(cell(3, 'Check Type'), { target: { value: 'Gauge' } })
    type(3, 'Standard', ' M8 ')
    type(3, 'Instrument', ' PG-01 ')
    save()
    await waitFor(() => expect(m.createMany).toHaveBeenCalledTimes(1))
    expect(m.create).not.toHaveBeenCalled()
    const sent = m.createMany.mock.calls[0][0]
    expect(sent).toHaveLength(2)
    expect(sent[0]).toEqual({
      part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', job_work_code: null, type_of_operation: 'Rough Turning',
      quality_parameter: 'OD', standard: 50, upper_tolerance: 0.1, lower_tolerance: null,
      check_type: 'Measured', gauge_ref: null, gauge_standard: null, expected_text_value: null, remarks: null,
    })
    expect(sent[1]).toMatchObject({ quality_parameter: 'Thread', check_type: 'Gauge', standard: null, gauge_standard: 'M8', gauge_ref: 'PG-01' })
    expect(await screen.findByText('2 parameters saved for P1 – Rough Turning.')).toBeTruthy()
    expect(cell(1, 'Parameter').value).toBe('')
  })

  it('DB refusal: nothing saved, typed rows stay, message shown', async () => {
    m.createMany.mockImplementation(async () => { throw new Error('new row violates check constraint') })
    await openBulk()
    pickCategoryTarget()
    type(1, 'Parameter', 'OD')
    type(1, 'Standard', '50')
    save()
    await waitFor(() => expect(m.createMany).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/check constraint/)).toBeTruthy()
    expect(cell(1, 'Parameter').value).toBe('OD')
    expect(cell(1, 'Standard').value).toBe('50')
  })

  it('no "Copy from…" on the panel', async () => {
    await openBulk()
    expect(screen.queryByText(/copy from/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^load$/i })).toBeNull()
  })

  it('Job Work: no Check Type column, text Standard, saves Gauge with numbers null', async () => {
    await openBulk()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Job Work' }).at(-1))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('HT'), 'HT')
    pick(selectWith('Toughening'), 'Toughening')
    expect(screen.queryByLabelText('Row 1 Check Type')).toBeNull()
    expect(screen.queryByLabelText('Row 1 Upper Tol')).toBeNull()
    expect(cell(1, 'Standard').type).not.toBe('number')
    type(1, 'Parameter', 'Hardness')
    type(1, 'Standard', '58-62 HRC')
    save()
    await waitFor(() => expect(m.createMany).toHaveBeenCalledTimes(1))
    expect(m.createMany.mock.calls[0][0]).toEqual([{
      part_serial_number: 'P1', machine_id: null, machine_category: null, job_work_code: 'HT', type_of_operation: 'Toughening',
      quality_parameter: 'Hardness', standard: null, upper_tolerance: null, lower_tolerance: null,
      check_type: 'Gauge', gauge_ref: null, gauge_standard: '58-62 HRC', expected_text_value: null, remarks: null,
    }])
  })

  it('DB refusal naming one row: error says "Row N (name)" and marks that row', async () => {
    m.createMany.mockImplementation(async () => {
      throw Object.assign(new Error('duplicate key value violates unique constraint "qm_key"'), { details: 'Key (part_serial_number, quality_parameter)=(P1, Len) already exists.' })
    })
    await openBulk()
    pickCategoryTarget()
    type(1, 'Parameter', 'OD')
    type(1, 'Standard', '50')
    type(3, 'Parameter', 'Len')
    type(3, 'Standard', '10')
    save()
    expect(await screen.findByText('Row 3 (Len): This record already exists (a value that must be unique is already used).')).toBeTruthy()
    expect(screen.getByTestId('bulk-row-3').getAttribute('data-invalid')).toBe('true')
    expect(screen.queryByTestId('bulk-row-error-1')).toBeNull()
    expect(cell(3, 'Parameter').value).toBe('Len')
  })

  it('Back to single parameter restores the single form (empty grid: no warning)', async () => {
    await openBulk()
    fireEvent.click(screen.getByRole('button', { name: /back to single parameter/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByLabelText('Row 1 Parameter')).toBeNull()
    expect(document.querySelector('input[list="quality-parameter-suggestions"]')).toBeTruthy()
  })

  it('typed rows: Back / New / list row click warn first; Keep editing stays, Discard leaves', async () => {
    m.records = [{ id: 1, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50 }]
    await openBulk()
    type(2, 'Parameter', 'typed')

    fireEvent.click(screen.getByRole('button', { name: /back to single parameter/i }))
    let dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Discard the typed parameters?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(cell(2, 'Parameter').value).toBe('typed')

    fireEvent.click(screen.getByRole('button', { name: /^new/i }))
    dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

    fireEvent.click(await screen.findByText('OD', { selector: 'td' }))
    dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByLabelText('Row 1 Parameter')).toBeNull())
    expect(screen.getByRole('button', { name: /^Edit/ })).toBeTruthy() // the clicked row opened in the single form
  })
})
