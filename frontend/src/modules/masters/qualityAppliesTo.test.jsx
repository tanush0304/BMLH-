// @vitest-environment jsdom
// Quality Master "Applies To" (044): Machine Category (default) or a Specific
// Machine; Type of Operation options follow; payload nulls the other field;
// list shows "CNC (all)"; duplicate guard. Before 044: the old Machine form.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  supported: true,
  create: vi.fn(async (p) => ({ id: 99, ...p })),
  records: [],
}))
vi.mock('../../data/queries/qualityParameters', () => ({
  listQualityParameters: async () => m.records,
  createQualityParameter: m.create,
  updateQualityParameter: vi.fn(),
  deleteQualityParameter: vi.fn(),
  qualityCategorySupported: async () => m.supported,
  qualityCheckTypeSupported: async () => m.checkType ?? false,
  parameterHasReadings: async (id) => (m.withReadings ?? []).includes(id),
}))
vi.mock('../../data/queries/products', () => ({ listProducts: async () => [{ part_serial_number: 'P1', part_name: 'Shaft' }] }))
vi.mock('../../data/queries/machines', () => ({
  listMachines: async () => [
    { machine_id: 'MC-004', machine_name: 'CNC 1', category: 'CNC' },
    { machine_id: 'MC-005', machine_name: 'CNC 2', category: 'CNC' },
    { machine_id: 'MC-007', machine_name: 'VMC 1', category: 'VMC' },
  ],
}))
vi.mock('../../data/queries/cycleTimes', () => ({
  listCycleTimes: async () => [
    { part_serial_number: 'P1', machine_id: 'MC-004', operation: 'Rough Turning' },
    { part_serial_number: 'P1', machine_id: 'MC-005', operation: 'Finish Turning' },
    { part_serial_number: 'P1', machine_id: 'MC-007', operation: 'Drilling' },
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

const selects = () => screen.getAllByTestId('ss')
const optionTexts = (el) => [...el.options].map((o) => o.textContent).filter(Boolean)
const optionValues = (el) => [...el.options].map((o) => o.value).filter(Boolean)
const selectWith = (value) => selects().find((el) => optionValues(el).includes(value))
const pick = (el, value) => fireEvent.change(el, { target: { value } })

async function ready() {
  render(<QualityMaster />)
  await waitFor(() => expect(selectWith('P1')).toBeTruthy())
}

function fillNumbers() {
  const inputs = document.querySelectorAll('input[type="number"]')
  fireEvent.change(inputs[0], { target: { value: '50' } })
}

beforeEach(() => {
  m.supported = true
  m.records = []
  m.create.mockClear()
})
afterEach(() => cleanup())

describe('Quality Master -- Applies To', () => {
  it('defaults to Machine Category; operations come from every machine of the category', async () => {
    await ready()
    await waitFor(() => expect(screen.getByLabelText('Machine Category')).toBeTruthy())
    expect(screen.getByLabelText('Machine Category').checked).toBe(true)
    pick(selectWith('P1'), 'P1')
    pick(selectWith('CNC'), 'CNC')
    const op = selectWith('Rough Turning')
    expect(optionTexts(op)).toEqual(['Rough Turning', 'Finish Turning'])
  })

  it('Specific Machine: operations of that machine only', async () => {
    await ready()
    await waitFor(() => screen.getByLabelText('Specific Machine'))
    fireEvent.click(screen.getByLabelText('Specific Machine'))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('MC-005'), 'MC-005')
    expect(optionTexts(selectWith('Finish Turning'))).toEqual(['Finish Turning'])
  })

  it('saves a category row with machine_id null', async () => {
    await ready()
    await waitFor(() => screen.getByLabelText('Machine Category'))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('CNC'), 'CNC')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'OD' } })
    fillNumbers()
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalled())
    expect(m.create.mock.calls[0][0]).toMatchObject({ part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD' })
  })

  it('refuses a duplicate parameter for the same part + operation + category', async () => {
    m.records = [{ id: 1, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50 }]
    await ready()
    await waitFor(() => screen.getByLabelText('Machine Category'))
    fireEvent.click(screen.getByRole('button', { name: /new/i }))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('CNC'), 'CNC')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: ' od ' } })
    fillNumbers()
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/OD is already defined for P1 – Rough Turning on CNC \(all\)/)).toBeTruthy()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('list shows "CNC (all)" for a category row and the machine label for a machine row', async () => {
    m.records = [
      { id: 1, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD' },
      { id: 2, part_serial_number: 'P1', machine_id: 'MC-007', machine_category: null, type_of_operation: 'Drilling', quality_parameter: 'Hole' },
    ]
    await ready()
    expect(await screen.findByText('CNC (all)')).toBeTruthy()
    expect(screen.getAllByText(/MC-007/).length).toBeGreaterThan(0)
  })

  it('before 044: no Applies To, Machine required, no machine_category sent', async () => {
    m.supported = false
    await ready()
    await waitFor(() => expect(selectWith('MC-004')).toBeTruthy())
    expect(screen.queryByLabelText('Machine Category')).toBeNull()
    pick(selectWith('P1'), 'P1')
    pick(selectWith('MC-004'), 'MC-004')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'OD' } })
    fillNumbers()
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalled())
    const payload = m.create.mock.calls[0][0]
    expect(payload.machine_id).toBe('MC-004')
    expect('machine_category' in payload).toBe(false)
  })
})

describe('Quality Master -- Check Type (048)', () => {
  async function fillBase() {
    await ready()
    await waitFor(() => screen.getByLabelText('Machine Category'))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('CNC'), 'CNC')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'Thread' } })
  }
  const checkType = () => screen.getByText('Check Type', { selector: 'span' }).closest('label').querySelector('select')

  it('Gauge: Standard / tolerances hidden and not required; saves check_type Gauge, nulls, gauge_ref', async () => {
    m.checkType = true
    try {
      await fillBase()
      fireEvent.change(checkType(), { target: { value: 'Gauge' } })
      expect(screen.queryByText('Standard', { selector: 'span' })).toBeNull()
      fireEvent.change(screen.getByText('Gauge (name / no.)', { selector: 'span' }).closest('label').querySelector('input'), { target: { value: ' M10 GO/NO-GO ' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(m.create).toHaveBeenCalled())
      expect(m.create.mock.calls[0][0]).toMatchObject({ check_type: 'Gauge', gauge_ref: 'M10 GO/NO-GO', standard: null, upper_tolerance: null, lower_tolerance: null })
    } finally {
      m.checkType = false
    }
  })

  it('Measured (default): Standard still required; saves check_type Measured, gauge_ref null', async () => {
    m.checkType = true
    try {
      await fillBase()
      expect(checkType().value).toBe('Measured')
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(await screen.findByText('Standard is required.')).toBeTruthy()
      fillNumbers()
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(m.create).toHaveBeenCalled())
      expect(m.create.mock.calls[0][0]).toMatchObject({ check_type: 'Measured', gauge_ref: null, standard: 50 })
    } finally {
      m.checkType = false
    }
  })

  it('before 048: no Check Type field, nothing about it sent', async () => {
    await fillBase()
    expect(screen.queryByText('Check Type', { selector: 'span' })).toBeNull()
    fillNumbers()
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalled())
    expect(m.create.mock.calls[0][0]).not.toHaveProperty('check_type')
  })
})

describe('Quality Master -- Check Type locked once there are readings (048)', () => {
  it('a parameter with readings: Check Type disabled + note; without readings: editable', async () => {
    m.checkType = true
    m.withReadings = [1]
    m.records = [
      { id: 1, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50, check_type: 'Measured' },
      { id: 2, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'Length', standard: 120, check_type: 'Measured' },
    ]
    try {
      await ready()
      const checkType = () => screen.getByText('Check Type', { selector: 'span' }).closest('label').querySelector('select')
      fireEvent.click(await screen.findByText('OD'))
      fireEvent.click(screen.getByRole('button', { name: /^Edit/ }))
      expect(await screen.findByTestId('check-type-locked')).toBeTruthy()
      expect(screen.getByTestId('check-type-locked').textContent).toBe('Has readings -- add a new parameter instead')
      expect(checkType().disabled).toBe(true)

      fireEvent.click(screen.getByText('Length'))
      fireEvent.click(screen.getByRole('button', { name: /^Edit/ }))
      await waitFor(() => expect(screen.queryByTestId('check-type-locked')).toBeNull())
      expect(checkType().disabled).toBe(false)
    } finally {
      m.checkType = false
      m.withReadings = []
    }
  })
})
