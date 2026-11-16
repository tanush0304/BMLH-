// @vitest-environment jsdom
// Quality Inspection picks the stage by id (two stages with the same operation
// name are two options, "Stage N – op"), and parameters come from the exact
// machine + its category (exact wins per name).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  createLog: vi.fn(async () => ({ id: 500 })),
  createReadings: vi.fn(async () => []),
  params: [],
}))
vi.mock('../../data/queries/employees', () => ({ listEmployees: async () => [{ employee_id: 'E1', employee_name: 'Ravi' }] }))
vi.mock('../../data/queries/shifts', () => ({ listShifts: async () => [{ shift_code: 'A', shift_name: 'Shift A' }] }))
vi.mock('../../data/queries/machines', () => ({
  listMachines: async () => [
    { machine_id: 'MC-004', machine_name: 'CNC 1', category: 'CNC' },
    { machine_id: 'MC-007', machine_name: 'VMC 1', category: 'VMC' },
  ],
}))
vi.mock('../../data/queries/qualityLogs', () => ({
  listPrdsWithRouteCard: async () => [{ prd_no: 'PRD-001', part_serial_number: 'P1' }],
  createQualityLog: m.createLog,
  createQualityLogReadings: m.createReadings,
  listQualityInspectionHistory: async () => m.history ?? [],
  updateQualityLog: vi.fn(),
  updateQualityLogReading: vi.fn(),
}))
vi.mock('../../data/queries/qualityParameters', () => ({ listQualityParameters: async () => m.params }))
vi.mock('../../data/queries/routeCards', () => ({
  getStagesForPrd: async () => [
    { id: 11, seq: 10, position: 1, operation: 'Rough Turning', type: 'Internal', machine_id: 'MC-004' },
    { id: 12, seq: 20, position: 2, operation: 'Drilling', type: 'Internal', machine_id: 'MC-007' },
    { id: 13, seq: 30, position: 3, operation: 'Rough Turning', type: 'Internal', machine_id: 'MC-004' },
  ],
}))
vi.mock('../../data/queries/machineOperations', () => ({ listAllMachineOperations: async () => [] }))
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => ({
          data: [
            { machine_id: 'MC-004', seq: 10, part_serial_number: 'P1' },
            { machine_id: 'MC-007', seq: 20, part_serial_number: 'P1' },
            { machine_id: 'MC-004', seq: 30, part_serial_number: 'P1' },
          ],
          error: null,
        }),
      }),
    }),
  },
}))
vi.mock('../../utils/usePartForPrd', () => ({ default: () => ({}) }))
vi.mock('../../components/OrderLineFields', () => ({ default: () => null }))
vi.mock('../../components/StockEditPanel', () => ({
  useAppUsers: () => [],
  withEditedLabels: (rows) => rows,
  EDITED_COLUMN: { key: 'edited', label: 'Edited' },
}))
vi.mock('../../components/EmployeeSelect', () => ({
  default: ({ value, onChange }) => (
    <select data-testid="employee" value={value} onChange={onChange}><option value="" /><option value="E1">Ravi</option></select>
  ),
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
import QualityInspectionScreen from './QualityInspectionScreen'

const values = (el) => [...el.options].map((o) => o.value).filter(Boolean)
const selectWith = (v) => screen.getAllByTestId('ss').find((el) => values(el).includes(v))
const pick = (el, value) => fireEvent.change(el, { target: { value } })

async function fillHeader(stageId) {
  render(<QualityInspectionScreen role="supervisor" />)
  await waitFor(() => expect(selectWith('PRD-001')).toBeTruthy())
  pick(screen.getByTestId('employee'), 'E1')
  const shift = [...document.querySelectorAll('select')].find((el) => values(el).includes('A'))
  pick(shift, 'A')
  pick(selectWith('PRD-001'), 'PRD-001')
  await waitFor(() => expect(selectWith('13')).toBeTruthy())
  pick(selectWith('MC-004'), 'MC-004')
  await waitFor(() => expect(values(selectWith('13'))).toEqual(['11', '13']))
  if (stageId) pick(selectWith('13'), stageId)
}

afterEach(() => {
  cleanup()
  m.createLog.mockClear()
  m.params = []
})

describe('Quality Inspection -- stage pick + category parameters', () => {
  it('two stages with the same operation are two options, labelled by position', async () => {
    await fillHeader()
    const opts = [...selectWith('13').options].filter((o) => o.value).map((o) => o.textContent)
    expect(opts).toEqual(['Stage 1 – Rough Turning', 'Stage 3 – Rough Turning'])
  })

  it('the second "Rough Turning" saves with its own stage id; exact machine beats category per name', async () => {
    m.params = [
      { id: 1, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50 },
      { id: 2, part_serial_number: 'P1', machine_id: 'MC-004', machine_category: null, type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 49.9 },
      { id: 3, part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', type_of_operation: 'Rough Turning', quality_parameter: 'Length', standard: 120 },
    ]
    await fillHeader('13')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(screen.getByText('Length')).toBeTruthy())
    expect(screen.getAllByText('OD')).toHaveLength(1)
    expect(screen.getByText('49.9')).toBeTruthy()
    const inputs = document.querySelectorAll('tbody input')
    fireEvent.change(inputs[0], { target: { value: '49.9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    await waitFor(() => expect(m.createLog).toHaveBeenCalled())
    expect(m.createLog.mock.calls[0][0]).toMatchObject({ prd_no: 'PRD-001', stage_id: 13, machine_id: 'MC-004' })
  })

  it('nothing matches -> reworded message with part, operation, machine / category', async () => {
    await fillHeader('11')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('No quality parameters are defined for P1 - Rough Turning (MC-004 / CNC). Add them in Quality Master before an inspection can be logged here.')).toBeTruthy()
  })
})

describe('Quality Inspection -- Gauge checks (048)', () => {
  const PARAMS = [
    { id: 1, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50, check_type: 'Measured' },
    { id: 2, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'Thread', standard: null, check_type: 'Gauge', gauge_ref: 'M10 GO/NO-GO' },
  ]

  it('gauge row: OK / Not OK buttons (required), no number box, live Accepted / Rejected; saved as gauge_result with no value', async () => {
    m.params = PARAMS
    m.createReadings.mockClear()
    await fillHeader('13')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(screen.getByText('Thread')).toBeTruthy())
    expect(screen.getByText('Thread').closest('tr').querySelector('[data-testid="instrument-cell"]').textContent).toBe('M10 GO/NO-GO')
    const gaugeRow = screen.getByText('Thread').closest('tr')
    expect(gaugeRow.querySelector('input[type="number"]')).toBeNull()

    fireEvent.change(document.querySelector('tbody input[type="number"]'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    expect(await screen.findByText('Choose OK or Not OK for Thread.')).toBeTruthy()
    expect(m.createLog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Thread gauge: Not OK' }))
    expect(gaugeRow.textContent).toContain('Rejected')
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    await waitFor(() => expect(m.createReadings).toHaveBeenCalled())
    const rows = m.createReadings.mock.calls[0][0]
    expect(rows.find((r) => r.quality_parameter_id === 2)).toEqual({ quality_log_id: 500, quality_parameter_id: 2, observed_value: null, gauge_result: 'Not OK' })
    expect(rows.find((r) => r.quality_parameter_id === 1)).toEqual({ quality_log_id: 500, quality_parameter_id: 1, observed_value: 50 })
  })
})

describe('Quality Inspection -- Gauge Standard (053)', () => {
  const PARAMS = [
    { id: 1, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50, upper_tolerance: 1, lower_tolerance: 1, check_type: 'Measured' },
    // standard 12 on a Gauge row must never be shown or used for the result
    { id: 2, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'Thread', standard: 12, upper_tolerance: 0, lower_tolerance: 0, check_type: 'Gauge', gauge_ref: 'PG-01', gauge_standard: 'M8x1.25 6H' },
  ]

  it('Standard column: number for Measured, text spec for Gauge (same column, next to the OK / Not OK buttons); result from the buttons only', async () => {
    m.params = PARAMS
    await fillHeader('13')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(screen.getByText('Thread')).toBeTruthy())
    const gaugeRow = screen.getByText('Thread').closest('tr')
    const measuredRow = screen.getByText('OD').closest('tr')
    expect(gaugeRow.querySelector('[data-testid="standard-cell"]').textContent).toBe('M8x1.25 6H')
    expect(measuredRow.querySelector('[data-testid="standard-cell"]').textContent).toBe('50')
    // same column index in both rows
    const idx = (row) => [...row.children].findIndex((td) => td.dataset.testid === 'standard-cell')
    expect(idx(gaugeRow)).toBe(idx(measuredRow))
    expect(gaugeRow.textContent).not.toContain('12')
    fireEvent.click(screen.getByRole('button', { name: 'Thread gauge: OK' }))
    expect(gaugeRow.textContent).toContain('Accepted')
    fireEvent.click(screen.getByRole('button', { name: 'Thread gauge: Not OK' }))
    expect(gaugeRow.textContent).toContain('Rejected')
  })

  it('history list has a Standard column (Measured number / Gauge text)', async () => {
    m.params = []
    m.history = [
      { reading_id: 11, quality_log_id: 7, log_date: '2026-11-16', prd_no: 'PRD-001', machine_id: 'MC-004', operation: 'Rough Turning', quality_parameter: 'OD', check_type: 'Measured', standard: 50, observed_value: 50.2, result: 'Accepted' },
      { reading_id: 12, quality_log_id: 7, log_date: '2026-11-16', prd_no: 'PRD-001', machine_id: 'MC-004', operation: 'Rough Turning', quality_parameter: 'Thread', check_type: 'Gauge', standard: 12, gauge_standard: 'M8x1.25 6H', gauge_result: 'OK', observed_value: null, result: 'Accepted' },
    ]
    try {
      render(<QualityInspectionScreen />)
      expect(await screen.findByText('M8x1.25 6H')).toBeTruthy()
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
      expect(headers.indexOf('Standard')).toBeGreaterThan(-1)
      expect(headers.indexOf('Standard')).toBe(headers.indexOf('Observed Value') - 1)
    } finally {
      m.history = undefined
    }
  })
})

describe('Quality Inspection -- Instrument column', () => {
  it('entry table: Instrument for Measured and Gauge rows; history column + value', async () => {
    m.params = [
      { id: 1, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50, check_type: 'Measured', gauge_ref: 'Micrometer' },
      { id: 2, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'Thread', check_type: 'Gauge', gauge_ref: 'PG-01' },
      { id: 3, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'Length', standard: 20, check_type: 'Measured' },
    ]
    await fillHeader('13')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(screen.getByText('Thread')).toBeTruthy())
    const cell = (name) => screen.getByText(name).closest('tr').querySelector('[data-testid="instrument-cell"]').textContent
    expect(cell('OD')).toBe('Micrometer')
    expect(cell('Thread')).toBe('PG-01')
    expect(cell('Length')).toBe('—')
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Instrument')
  })

  it('history list shows the Instrument for a Measured reading', async () => {
    m.params = []
    m.history = [
      { reading_id: 21, quality_log_id: 9, log_date: '2026-11-16', prd_no: 'PRD-001', machine_id: 'MC-004', operation: 'Rough Turning', quality_parameter: 'OD', check_type: 'Measured', gauge_ref: 'Micrometer', standard: 50, observed_value: 50, result: 'Accepted' },
    ]
    try {
      render(<QualityInspectionScreen />)
      expect(await screen.findByText('Micrometer')).toBeTruthy()
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
      expect(headers.indexOf('Instrument')).toBe(headers.indexOf('Check Type') + 1)
    } finally {
      m.history = undefined
    }
  })
})
