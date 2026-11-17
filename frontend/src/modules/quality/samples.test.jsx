// @vitest-environment jsdom
// 057: several samples per parameter (paper In-Process Inspection Report).
// Samples control hidden before 057; one column per sample; a parameter is
// Not Accepted / Rejected when any sample is; sample_no saved; history groups
// samples per parameter; supervisor edit shows every saved sample.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  createLog: vi.fn(async () => ({ id: 500 })),
  createReadings: vi.fn(async () => []),
  updateReading: vi.fn(async () => ({})),
  params: [],
  history: [],
  samplesOn: false,
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
  listQualityInspectionHistory: async () => m.history,
  updateQualityLog: vi.fn(),
  updateQualityLogReading: m.updateReading,
}))
vi.mock('../../data/queries/qualitySamples', () => ({ qualitySamplesSupported: async () => m.samplesOn }))
vi.mock('../../data/queries/qualityParameters', () => ({ listQualityParameters: async () => m.params }))
vi.mock('../../data/queries/routeCards', () => ({
  getStagesForPrd: async () => [
    { id: 11, seq: 10, position: 1, operation: 'Rough Turning', type: 'Internal', machine_id: 'MC-004' },
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

const PARAMS = [
  { id: 1, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'OD', standard: 50, upper_tolerance: 0.1, lower_tolerance: 0.1, check_type: 'Measured', gauge_ref: 'Micrometer' },
  { id: 2, part_serial_number: 'P1', machine_id: 'MC-004', type_of_operation: 'Rough Turning', quality_parameter: 'Thread', standard: null, check_type: 'Gauge', gauge_ref: 'M10 GO/NO-GO', gauge_standard: 'M10x1.5' },
]

async function readings(samplesOn = true) {
  m.samplesOn = samplesOn
  m.params = PARAMS
  render(<QualityInspectionScreen role="supervisor" />)
  await waitFor(() => expect(selectWith('PRD-001')).toBeTruthy())
  pick(screen.getByTestId('employee'), 'E1')
  pick([...document.querySelectorAll('select')].find((el) => values(el).includes('A')), 'A')
  pick(selectWith('PRD-001'), 'PRD-001')
  await waitFor(() => expect(selectWith('MC-004')).toBeTruthy())
  pick(selectWith('MC-004'), 'MC-004')
  await waitFor(() => expect(selectWith('13')).toBeTruthy())
  pick(selectWith('13'), '13')
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(screen.getByText('Thread')).toBeTruthy())
}
const samplesInput = () => screen.queryByLabelText('Samples')
const setSamples = (n) => fireEvent.change(samplesInput(), { target: { value: String(n) } })
const odRow = () => screen.getByText('OD').closest('tr')
const threadRow = () => screen.getByText('Thread').closest('tr')

afterEach(() => {
  cleanup()
  m.createLog.mockClear()
  m.createReadings.mockClear()
  m.updateReading.mockClear()
  m.samplesOn = false
  m.history = []
})

describe('Quality Inspection -- samples (057)', () => {
  it('before 057: no Samples control, one value per parameter, sample_no never sent', async () => {
    await readings(false)
    expect(samplesInput()).toBeNull()
    expect(screen.queryAllByTestId('sample-header')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('OD'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Thread gauge: OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    await waitFor(() => expect(m.createReadings).toHaveBeenCalled())
    expect(m.createReadings.mock.calls[0][0]).toEqual([
      { quality_log_id: 500, quality_parameter_id: 1, observed_value: 50 },
      { quality_log_id: 500, quality_parameter_id: 2, observed_value: null, gauge_result: 'OK' },
    ])
  })

  it('after 057: Samples defaults to 1; 3 -> three columns; Standard / tolerance / Instrument once per row', async () => {
    await readings()
    expect(samplesInput().value).toBe('1')
    setSamples(3)
    expect(screen.getAllByTestId('sample-header').map((h) => h.textContent)).toEqual(['1', '2', '3'])
    expect(odRow().querySelectorAll('input[type="number"]')).toHaveLength(3)
    expect(threadRow().querySelectorAll('[role="group"]')).toHaveLength(3)
    expect(odRow().querySelectorAll('[data-testid="standard-cell"]')).toHaveLength(1)
    expect(odRow().querySelector('[data-testid="instrument-cell"]').textContent).toBe('Micrometer')
    expect(threadRow().querySelector('[data-testid="standard-cell"]').textContent).toBe('M10x1.5')
  })

  it('one sample out of tolerance -> OD Not Accepted (cell red); one Not OK -> Thread Rejected', async () => {
    await readings()
    setSamples(3)
    fireEvent.change(screen.getByLabelText('OD sample 1'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('OD sample 2'), { target: { value: '50.05' } })
    fireEvent.change(screen.getByLabelText('OD sample 3'), { target: { value: '50.05' } })
    expect(odRow().textContent).toContain('Accepted')
    expect(odRow().textContent).not.toContain('Not Accepted')
    fireEvent.change(screen.getByLabelText('OD sample 3'), { target: { value: '50.2' } })
    expect(odRow().textContent).toContain('Not Accepted')
    expect(screen.getByLabelText('OD sample 3').dataset.invalid).toBe('true')
    expect(screen.getByLabelText('OD sample 1').dataset.invalid).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Thread sample 1 gauge: OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Thread sample 2 gauge: Not OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Thread sample 3 gauge: OK' }))
    expect(threadRow().textContent).toContain('Rejected')
  })

  it('every sample is required; saves one row per sample with sample_no', async () => {
    await readings()
    setSamples(2)
    fireEvent.change(screen.getByLabelText('OD sample 1'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Thread sample 1 gauge: OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Thread sample 2 gauge: Not OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    expect(await screen.findByText('Enter OD, sample 2.')).toBeTruthy()
    expect(m.createLog).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('OD sample 2'), { target: { value: '50.02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    await waitFor(() => expect(m.createReadings).toHaveBeenCalled())
    expect(m.createReadings.mock.calls[0][0]).toEqual([
      { quality_log_id: 500, quality_parameter_id: 1, observed_value: 50, sample_no: 1 },
      { quality_log_id: 500, quality_parameter_id: 1, observed_value: 50.02, sample_no: 2 },
      { quality_log_id: 500, quality_parameter_id: 2, observed_value: null, gauge_result: 'OK', sample_no: 1 },
      { quality_log_id: 500, quality_parameter_id: 2, observed_value: null, gauge_result: 'Not OK', sample_no: 2 },
    ])
  })

  it('Samples above 10 is refused on save; lowering Samples drops the extra values', async () => {
    await readings()
    setSamples(3)
    fireEvent.change(screen.getByLabelText('OD sample 3'), { target: { value: '51' } })
    setSamples(2)
    expect(screen.queryByLabelText('OD sample 3')).toBeNull()
    setSamples(3)
    expect(screen.getByLabelText('OD sample 3').value).toBe('')
    setSamples(11)
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    expect(await screen.findByText('Samples must be a whole number from 1 to 10.')).toBeTruthy()
    expect(m.createLog).not.toHaveBeenCalled()
  })
})

describe('Quality Inspection history + edit with samples (057)', () => {
  const H = { quality_log_id: 7, prd_no: 'PRD-001', machine_id: 'MC-004', operation: 'Rough Turning', log_date: '2026-11-17', employee_id: 'E1', shift_code: 'A', standard: 50, upper_tolerance: 0.1, lower_tolerance: 0.1, check_type: 'Measured', quality_parameter_id: 1, quality_parameter: 'OD' }
  const HISTORY = [
    { ...H, reading_id: 101, sample_no: 1, observed_value: 50, result: 'Accepted' },
    { ...H, reading_id: 102, sample_no: 2, observed_value: 50.3, result: 'Not Accepted' },
    { ...H, reading_id: 103, sample_no: 3, observed_value: 49.95, result: 'Accepted' },
  ]

  it('one history row per parameter: all samples, min / max, count, parameter result', async () => {
    m.samplesOn = true
    m.history = HISTORY
    render(<QualityInspectionScreen role="supervisor" />)
    const cell = await screen.findByText('50, 50.3, 49.95 (n=3)')
    const row = cell.closest('tr')
    expect(row.textContent).toContain('49.95')
    expect(row.textContent).toContain('50.3')
    expect(row.textContent).toContain('Not Accepted')
    expect(screen.getAllByText('OD')).toHaveLength(1)
  })

  it('Edit shows every saved sample of the inspection and saves only the changed one', async () => {
    m.samplesOn = true
    m.history = HISTORY
    render(<QualityInspectionScreen role="supervisor" />)
    fireEvent.click(await screen.findByText('50, 50.3, 49.95 (n=3)'))
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await waitFor(() => expect(screen.getByLabelText('OD sample 2')).toBeTruthy())
    expect(screen.getByLabelText('OD sample 2').value).toBe('50.3')
    fireEvent.change(screen.getByLabelText('OD sample 2'), { target: { value: '50.05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(m.updateReading).toHaveBeenCalled())
    expect(m.updateReading.mock.calls).toEqual([[102, { observed_value: 50.05 }]])
  })
})
