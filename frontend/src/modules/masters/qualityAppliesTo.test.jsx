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
  qualityGaugeStandardSupported: async () => m.gaugeStandard ?? false,
  parameterHasReadings: async (id) => (m.withReadings ?? []).includes(id),
}))
// 054: Applies To "Job Work" (part + job_work_code)
vi.mock('../../data/queries/jobworkQc', () => ({ qualityReceiptSupported: async () => m.jobWork ?? false }))
vi.mock('../../data/queries/jobWorkTypes', () => ({
  listJobWorkTypes: async () => [{ job_work_code: 'HT', type_of_job_work: 'Heat Treatment' }, { job_work_code: 'BR', type_of_job_work: 'Broaching' }],
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
  if (inputs[0]) fireEvent.change(inputs[0], { target: { value: '50' } }) // Job Work (056): no numeric Standard
}

beforeEach(() => {
  m.supported = true
  m.jobWork = false
  m.records = []
  m.create.mockClear()
})
afterEach(() => cleanup())

describe('Quality Master -- Job Work (054)', () => {
  async function fillJobWorkRow(param = 'Hardness') {
    await ready()
    await waitFor(() => screen.getByRole('radio', { name: 'Job Work' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Job Work' }))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('HT'), 'HT')
    pick(selectWith('Toughening'), 'Toughening')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: param } })
    fillNumbers()
  }

  it('before 054: no Job Work option and job_work_code never sent', async () => {
    await ready()
    await waitFor(() => screen.getByLabelText('Machine Category'))
    expect(screen.queryByRole('radio', { name: 'Job Work' })).toBeNull()
    pick(selectWith('P1'), 'P1')
    pick(selectWith('CNC'), 'CNC')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'OD' } })
    fillNumbers()
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalled())
    expect('job_work_code' in m.create.mock.calls[0][0]).toBe(false)
  })

  it('after 054: Job Work row = part + job_work_code; operations from that job work; no machine / category', async () => {
    m.jobWork = true
    await fillJobWorkRow()
    expect(optionTexts(selectWith('HT'))).toEqual(['Heat Treatment (HT)', 'Broaching (BR)'])
    expect(optionTexts(selectWith('Toughening'))).toEqual(['Toughening'])
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalled())
    expect(m.create.mock.calls[0][0]).toMatchObject({
      part_serial_number: 'P1', job_work_code: 'HT', machine_id: null, machine_category: null, type_of_operation: 'Toughening', quality_parameter: 'Hardness',
    })
  })

  it('after 054: a machine row sends job_work_code null', async () => {
    m.jobWork = true
    await ready()
    await waitFor(() => screen.getByLabelText('Specific Machine'))
    fireEvent.click(screen.getByLabelText('Specific Machine'))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('MC-004'), 'MC-004')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'OD' } })
    fillNumbers()
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalled())
    expect(m.create.mock.calls[0][0]).toMatchObject({ machine_id: 'MC-004', job_work_code: null })
  })

  it('refuses a duplicate Job Work parameter; list shows "Job Work: Heat Treatment"', async () => {
    m.jobWork = true
    m.records = [{ id: 1, part_serial_number: 'P1', machine_id: null, machine_category: null, job_work_code: 'HT', type_of_operation: 'Toughening', quality_parameter: 'Hardness', standard: 50 }]
    await fillJobWorkRow(' hardness ')
    expect(screen.getAllByText('Job Work: Heat Treatment').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/Hardness is already defined for P1 – Toughening on Job Work HT/)).toBeTruthy()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('a saved Job Work row opens with Applies To = Job Work', async () => {
    m.jobWork = true
    m.records = [{ id: 1, part_serial_number: 'P1', machine_id: null, machine_category: null, job_work_code: 'HT', type_of_operation: 'Toughening', quality_parameter: 'Hardness', standard: 50 }]
    await ready()
    fireEvent.click(await screen.findByText('Hardness'))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Job Work' }).checked).toBe(true))
  })
})

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
      fireEvent.change(screen.getByText('Instrument', { selector: 'span' }).closest('label').querySelector('input'), { target: { value: ' M10 GO/NO-GO ' } })
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
      expect(m.create.mock.calls[0][0]).toMatchObject({ check_type: 'Measured', gauge_ref: null, standard: 50 }) // Instrument left blank
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

describe('Quality Master -- Gauge Standard (053)', () => {
  async function fillGauge() {
    await ready()
    await waitFor(() => screen.getByLabelText('Machine Category'))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('CNC'), 'CNC')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'Thread' } })
    const ct = await waitFor(() => screen.getByText('Check Type', { selector: 'span' }).closest('label').querySelector('select'))
    fireEvent.change(ct, { target: { value: 'Gauge' } })
  }
  const standardInput = () => screen.queryByText('Standard', { selector: 'span' })?.closest('label').querySelector('input')

  it('after 053: Gauge shows an optional text Standard, tolerances stay hidden; saves gauge_standard trimmed', async () => {
    m.checkType = true
    m.gaugeStandard = true
    try {
      await fillGauge()
      await waitFor(() => expect(standardInput()).toBeTruthy())
      expect(standardInput().type).not.toBe('number')
      expect(screen.queryByText('Upper Tolerance', { selector: 'span' })).toBeNull()
      expect(screen.queryByText('Lower Tolerance', { selector: 'span' })).toBeNull()
      fireEvent.change(standardInput(), { target: { value: '  M8x1.25 6H ' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(m.create).toHaveBeenCalled())
      expect(m.create.mock.calls[0][0]).toMatchObject({ check_type: 'Gauge', gauge_standard: 'M8x1.25 6H', standard: null, upper_tolerance: null, lower_tolerance: null })
    } finally {
      m.checkType = false
      m.gaugeStandard = false
    }
  })

  it('after 053: blank Gauge Standard is optional and saves null; Measured sends gauge_standard null', async () => {
    m.checkType = true
    m.gaugeStandard = true
    try {
      await fillGauge()
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(m.create).toHaveBeenCalled())
      expect(m.create.mock.calls[0][0]).toMatchObject({ check_type: 'Gauge', gauge_standard: null })
      cleanup()
      m.create.mockClear()
      await ready()
      await waitFor(() => screen.getByLabelText('Machine Category'))
      pick(selectWith('P1'), 'P1')
      pick(selectWith('CNC'), 'CNC')
      pick(selectWith('Rough Turning'), 'Rough Turning')
      fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'OD' } })
      await waitFor(() => screen.getByText('Check Type', { selector: 'span' }))
      fillNumbers()
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(m.create).toHaveBeenCalled())
      expect(m.create.mock.calls[0][0]).toMatchObject({ check_type: 'Measured', standard: 50, gauge_standard: null })
    } finally {
      m.checkType = false
      m.gaugeStandard = false
    }
  })

  it('before 053: Gauge has no Standard field and gauge_standard is never sent', async () => {
    m.checkType = true
    try {
      await fillGauge()
      expect(standardInput()).toBeFalsy()
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(m.create).toHaveBeenCalled())
      expect(m.create.mock.calls[0][0]).not.toHaveProperty('gauge_standard')
    } finally {
      m.checkType = false
    }
  })

  it('list Standard column: number for Measured, text spec for Gauge', async () => {
    m.checkType = true
    m.gaugeStandard = true
    m.records = [
      { id: 1, part_serial_number: 'P1', machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD', check_type: 'Measured', standard: 50 },
      { id: 2, part_serial_number: 'P1', machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'Thread', check_type: 'Gauge', standard: null, gauge_standard: 'M8x1.25 6H' },
    ]
    try {
      await ready()
      expect(await screen.findByText('M8x1.25 6H')).toBeTruthy()
      expect(screen.getByText('50')).toBeTruthy()
    } finally {
      m.checkType = false
      m.gaugeStandard = false
    }
  })
})

describe('Quality Master -- Instrument (gauge_ref, both check types)', () => {
  const instrument = () => screen.getByText('Instrument', { selector: 'span' }).closest('label').querySelector('input')

  it('Measured: Instrument shown next to Standard, optional, saved trimmed to gauge_ref', async () => {
    m.checkType = true
    m.gaugeStandard = true
    try {
      await ready()
      await waitFor(() => screen.getByLabelText('Machine Category'))
      pick(selectWith('P1'), 'P1')
      pick(selectWith('CNC'), 'CNC')
      pick(selectWith('Rough Turning'), 'Rough Turning')
      fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'OD' } })
      await waitFor(() => expect(instrument()).toBeTruthy())
      expect(screen.queryByText('Gauge (name / no.)', { selector: 'span' })).toBeNull()
      fireEvent.change(instrument(), { target: { value: ' Micrometer 0-25 ' } })
      fillNumbers()
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(m.create).toHaveBeenCalled())
      expect(m.create.mock.calls[0][0]).toMatchObject({ check_type: 'Measured', standard: 50, gauge_ref: 'Micrometer 0-25' })
    } finally {
      m.checkType = false
      m.gaugeStandard = false
    }
  })

  it('list has an Instrument column for both types; hidden before 048', async () => {
    m.checkType = true
    m.records = [
      { id: 1, part_serial_number: 'P1', machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD', check_type: 'Measured', standard: 50, gauge_ref: 'Micrometer' },
      { id: 2, part_serial_number: 'P1', machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'Thread', check_type: 'Gauge', gauge_ref: 'PG-01' },
    ]
    try {
      await ready()
      expect(await screen.findByText('Micrometer')).toBeTruthy()
      expect(screen.getByText('PG-01')).toBeTruthy()
      expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Instrument')
    } finally {
      m.checkType = false
    }
    cleanup()
    await ready()
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0))
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).not.toContain('Instrument')
  })
})

describe('Quality Master -- Job Work is always OK / Not OK (056)', () => {
  const label = (text) => screen.queryByText(text, { selector: 'span' })
  async function startJobWork() {
    await ready()
    await waitFor(() => screen.getByRole('radio', { name: 'Job Work' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Job Work' }))
    pick(selectWith('P1'), 'P1')
    pick(selectWith('HT'), 'HT')
    pick(selectWith('Toughening'), 'Toughening')
    fireEvent.change(document.querySelector('input[list="quality-parameter-suggestions"]'), { target: { value: 'Hardness' } })
  }
  function on() { m.jobWork = true; m.checkType = true; m.gaugeStandard = true }
  function off() { m.checkType = false; m.gaugeStandard = false }

  it('hides Check Type; shows only text Standard + Instrument; no tolerances / numeric Standard', async () => {
    on()
    try {
      await startJobWork()
      await waitFor(() => expect(label('Instrument')).toBeTruthy())
      expect(label('Check Type')).toBeNull()
      expect(label('Upper Tolerance')).toBeNull()
      expect(label('Lower Tolerance')).toBeNull()
      expect(document.querySelectorAll('input[type="number"]').length).toBe(0)
      expect(label('Standard').closest('label').querySelector('input').type).not.toBe('number')
    } finally { off() }
  })

  it('saves check_type Gauge automatically, numerics null, gauge_standard + gauge_ref trimmed', async () => {
    on()
    try {
      await startJobWork()
      await waitFor(() => expect(label('Instrument')).toBeTruthy())
      fireEvent.change(label('Standard').closest('label').querySelector('input'), { target: { value: ' 58-62 HRC ' } })
      fireEvent.change(label('Instrument').closest('label').querySelector('input'), { target: { value: ' HT-01 ' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(m.create).toHaveBeenCalled())
      expect(m.create.mock.calls[0][0]).toMatchObject({
        job_work_code: 'HT', check_type: 'Gauge', gauge_standard: '58-62 HRC', gauge_ref: 'HT-01',
        standard: null, upper_tolerance: null, lower_tolerance: null,
      })
    } finally { off() }
  })

  it('switching away from Job Work brings back Check Type (Measured) + numeric Standard + tolerances', async () => {
    on()
    try {
      await startJobWork()
      await waitFor(() => expect(label('Instrument')).toBeTruthy())
      fireEvent.click(screen.getByLabelText('Machine Category'))
      await waitFor(() => expect(label('Check Type')).toBeTruthy())
      expect(label('Check Type').closest('label').querySelector('select').value).toBe('Measured')
      expect(label('Upper Tolerance')).toBeTruthy()
      expect(label('Lower Tolerance')).toBeTruthy()
      expect(label('Standard').closest('label').querySelector('input').type).toBe('number')
    } finally { off() }
  })
})
