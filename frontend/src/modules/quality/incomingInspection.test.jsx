// @vitest-environment jsdom
// Quality Inspection -- incoming inspection of a jobwork receipt (054) and the
// "Pending incoming QC" panel (055). A receipt log has NO machine: it is saved
// with machine_id null + receipt_id, uses Job Work Quality Master rows, and the
// history shows "Jobwork · JR-008" where a machine would be.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const m = vi.hoisted(() => ({
  createLog: vi.fn(async () => ({ id: 500 })),
  createReadings: vi.fn(async () => []),
  params: [],
  history: [],
  receiptOn: true,
  gateOn: true,
  gateData: null,
}))
const RECEIPTS = [
  { id: 8, dc_no: 'DC-008', receipt_no: 'JR-008', qty_received: 411, receipt_date: '2026-11-15', stage_id: 14, prd_no: 'PRD-001' },
  { id: 9, dc_no: 'DC-009', receipt_no: 'JR-009', qty_received: 118, receipt_date: '2026-11-16', stage_id: 14, prd_no: 'PRD-001' },
]
const STAGES = [
  { id: 11, prd_no: 'PRD-001', seq: 10, position: 1, operation: 'Rough Turning', type: 'Internal', machine_id: 'MC-004' },
  { id: 14, prd_no: 'PRD-001', seq: 40, position: 2, operation: 'Toughening', type: 'Outsourced', machine_id: null, job_work_code: 'HT' },
  { id: 15, prd_no: 'PRD-001', seq: 50, position: 3, operation: 'Finish Turning', type: 'Internal', machine_id: 'MC-004' },
]
vi.mock('../../data/queries/jobworkQc', () => ({
  qualityReceiptSupported: async () => m.receiptOn,
  jobworkQcGateSupported: async () => m.gateOn,
  loadQcGateData: async () => m.gateData,
  listReceiptsForPrd: async () => RECEIPTS,
  getReceiptWithDc: async (id) => RECEIPTS.find((r) => r.id === id) ?? null,
}))
vi.mock('../../data/queries/employees', () => ({ listEmployees: async () => [{ employee_id: 'E1', employee_name: 'Ravi' }] }))
vi.mock('../../data/queries/shifts', () => ({ listShifts: async () => [{ shift_code: 'A', shift_name: 'Shift A' }] }))
vi.mock('../../data/queries/machines', () => ({ listMachines: async () => [{ machine_id: 'MC-004', machine_name: 'CNC 1', category: 'CNC' }] }))
vi.mock('../../data/queries/qualityLogs', () => ({
  listPrdsWithRouteCard: async () => [{ prd_no: 'PRD-001', part_serial_number: 'P1' }],
  createQualityLog: m.createLog,
  createQualityLogReadings: m.createReadings,
  listQualityInspectionHistory: async () => m.history,
  updateQualityLog: vi.fn(),
  updateQualityLogReading: vi.fn(),
}))
vi.mock('../../data/queries/qualityParameters', () => ({ listQualityParameters: async () => m.params }))
vi.mock('../../data/queries/routeCards', () => ({ getStagesForPrd: async () => STAGES }))
vi.mock('../../data/queries/machineOperations', () => ({ listAllMachineOperations: async () => [] }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
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
  { id: 1, part_serial_number: 'P1', machine_id: null, machine_category: null, job_work_code: 'HT', type_of_operation: 'Toughening', quality_parameter: 'Hardness', check_type: 'Gauge', gauge_standard: '58-62 HRC', gauge_ref: 'HT-01', standard: null, upper_tolerance: null, lower_tolerance: null },
  { id: 2, part_serial_number: 'P1', machine_id: 'MC-004', machine_category: null, job_work_code: null, type_of_operation: 'Toughening', quality_parameter: 'OD', standard: 50 },
]
const gateData = () => ({
  settings: { on: true, from: null },
  stages: STAGES,
  dispatches: [{ dc_no: 'DC-008', prd_no: 'PRD-001', stage_id: 14 }, { dc_no: 'DC-009', prd_no: 'PRD-001', stage_id: 14 }],
  receipts: RECEIPTS.map((r) => ({ ...r, created_at: '2026-11-17T00:00:00Z' })),
  qcLogs: [{ id: 3, receipt_id: 9, log_date: '2026-11-16', inspection_result: 'Rejected' }],
  overrides: [],
})

function header() {
  pick(screen.getByTestId('employee'), 'E1')
  pick([...document.querySelectorAll('select')].find((el) => values(el).includes('A')), 'A')
}

async function receiptMode() {
  render(<QualityInspectionScreen role="operator" />)
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Jobwork receipt (incoming)' })).toBeTruthy())
  fireEvent.click(screen.getByRole('radio', { name: 'Jobwork receipt (incoming)' }))
  header()
  pick(selectWith('PRD-001'), 'PRD-001')
  await waitFor(() => expect(selectWith('8')).toBeTruthy())
}

beforeEach(() => {
  m.receiptOn = true
  m.gateOn = true
  m.gateData = gateData()
  m.params = PARAMS
  m.history = []
})
afterEach(() => {
  cleanup()
  m.createLog.mockClear()
  m.createReadings.mockClear()
})

describe('Quality Inspection -- jobwork receipt (054)', () => {
  it('before 054: no "Inspection Of" choice (machine inspection as before)', async () => {
    m.receiptOn = false
    m.gateOn = false
    render(<QualityInspectionScreen role="operator" />)
    await waitFor(() => expect(selectWith('PRD-001')).toBeTruthy())
    expect(screen.queryByRole('radio', { name: 'Jobwork receipt (incoming)' })).toBeNull()
    expect(selectWith('MC-004')).toBeTruthy()
  })

  it('receipt options name JR / DC / stage / qty / date; no Machine field; stage filled from the receipt', async () => {
    await receiptMode()
    const opts = [...selectWith('8').options].filter((o) => o.value).map((o) => o.textContent)
    expect(opts).toEqual(['JR-008 · DC-008 · Stage 2 – Toughening · 411 pcs · 15-11-2026', 'JR-009 · DC-009 · Stage 2 – Toughening · 118 pcs · 16-11-2026'])
    expect(selectWith('MC-004')).toBeUndefined()
    pick(selectWith('8'), '8')
    const stageField = screen.getAllByText('Stage', { selector: 'span' })[0].closest('label')
    expect(stageField.textContent).toContain('Stage 2 – Toughening')
  })

  it('Job Work parameters only; saved with machine_id null + receipt_id + the jobwork stage', async () => {
    await receiptMode()
    pick(selectWith('8'), '8')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(screen.getByText(/2\. Readings -- PRD-001 \/ Jobwork · JR-008 \/ Toughening/)).toBeTruthy())
    expect(screen.getByText('Hardness')).toBeTruthy()
    expect(screen.queryByText('OD')).toBeNull() // machine row not used for a receipt
    fireEvent.click(screen.getByRole('button', { name: 'Hardness gauge: OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    await waitFor(() => expect(m.createLog).toHaveBeenCalled())
    expect(m.createLog.mock.calls[0][0]).toEqual({ prd_no: 'PRD-001', stage_id: 14, machine_id: null, receipt_id: 8, employee_id: 'E1', shift_code: 'A' })
    expect(m.createReadings.mock.calls[0][0]).toEqual([{ quality_log_id: 500, quality_parameter_id: 1, observed_value: null, gauge_result: 'OK' }])
  })

  it('no Job Work parameters: says where to add them, nothing saved', async () => {
    m.params = [PARAMS[1]]
    await receiptMode()
    pick(selectWith('8'), '8')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText(/No quality parameters are defined for P1 - Toughening \(Job Work HT\)\. Add them in Quality Master \(Applies To: Job Work\)/)).toBeTruthy()
  })

  it('receipt is required in receipt mode', async () => {
    await receiptMode()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('Employee, Shift, Production Order and Jobwork Receipt are all required.')).toBeTruthy()
  })

  it('history: a receipt log (no machine) shows "Jobwork · JR-008" in the Machine column; a machine log its machine', async () => {
    m.history = [
      { reading_id: 1, quality_log_id: 3, log_date: '2026-11-16', prd_no: 'PRD-001', machine_id: '', receipt_id: 8, receipt_no: 'JR-008', operation: 'Toughening', quality_parameter: 'Hardness', observed_value: 31, standard: 30, result: 'Accepted' },
      { reading_id: 2, quality_log_id: 4, log_date: '2026-11-16', prd_no: 'PRD-001', machine_id: 'MC-004', receipt_id: null, receipt_no: '', operation: 'Rough Turning', quality_parameter: 'OD', observed_value: 50, standard: 50, result: 'Accepted' },
    ]
    m.gateOn = false
    render(<QualityInspectionScreen role="operator" />)
    expect(await screen.findByText('Jobwork · JR-008')).toBeTruthy()
    expect(screen.getAllByText('MC-004').length).toBeGreaterThan(0)
  })
})

describe('Pending incoming QC panel (055)', () => {
  it('lists waiting receipts with status; Inspect opens receipt mode on that receipt', async () => {
    render(<QualityInspectionScreen role="operator" />)
    const panel = await screen.findByRole('region', { name: 'Pending incoming QC' })
    expect(within(panel).getByText('Pending incoming QC (2)')).toBeTruthy()
    const rows = within(panel).getAllByRole('row').slice(1).map((r) => r.textContent)
    expect(rows[0]).toMatch(/PRD-001.*Toughening.*DC-008.*JR-008.*15-11-2026.*411.*Not inspected/)
    expect(rows[1]).toMatch(/JR-009.*16-11-2026.*118.*Rejected/)
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Inspect' })[0])
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Jobwork receipt (incoming)' }).checked).toBe(true))
    await waitFor(() => expect(selectWith('8').value).toBe('8'))
    expect(selectWith('PRD-001').value).toBe('PRD-001')
  })

  it('bell Open (initialMode qc:9) opens that receipt', async () => {
    render(<QualityInspectionScreen role="supervisor" initialMode="qc:9" />)
    await waitFor(() => expect(selectWith('9')?.value).toBe('9'))
    expect(screen.getByRole('radio', { name: 'Jobwork receipt (incoming)' }).checked).toBe(true)
  })

  it('hidden while the gate is off, and before 055', async () => {
    m.gateData = { ...gateData(), settings: { on: false, from: null } }
    render(<QualityInspectionScreen role="operator" />)
    await waitFor(() => expect(selectWith('PRD-001')).toBeTruthy())
    expect(screen.queryByRole('region', { name: 'Pending incoming QC' })).toBeNull()
    cleanup()
    m.gateOn = false
    render(<QualityInspectionScreen role="operator" />)
    await waitFor(() => expect(selectWith('PRD-001')).toBeTruthy())
    expect(screen.queryByRole('region', { name: 'Pending incoming QC' })).toBeNull()
  })
})

describe('Quality Inspection -- Job Work parameters are OK / Not OK (056)', () => {
  async function openReadings(params = PARAMS) {
    m.params = params
    await receiptMode()
    pick(selectWith('8'), '8')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(screen.getByText('Hardness')).toBeTruthy())
  }

  it('shows Standard text + Instrument with OK / Not OK buttons and no observed-value box', async () => {
    await openReadings()
    expect(screen.getByTestId('standard-cell').textContent).toBe('58-62 HRC')
    expect(screen.getByTestId('instrument-cell').textContent).toBe('HT-01')
    expect(screen.getByRole('button', { name: 'Hardness gauge: OK' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hardness gauge: Not OK' })).toBeTruthy()
    expect(document.querySelector('input[type="number"]')).toBeNull()
  })

  it('OK -> Accepted, Not OK -> Rejected', async () => {
    await openReadings()
    const row = screen.getByText('Hardness').closest('tr')
    fireEvent.click(screen.getByRole('button', { name: 'Hardness gauge: OK' }))
    expect(within(row).getByText('Accepted')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hardness gauge: Not OK' }))
    expect(within(row).getByText('Rejected')).toBeTruthy()
  })

  it('a Job Work row saved before 056 as Measured is still OK / Not OK (no number box)', async () => {
    await openReadings([{ ...PARAMS[0], check_type: 'Measured', standard: 30, upper_tolerance: 2, lower_tolerance: 2 }, PARAMS[1]])
    expect(document.querySelector('input[type="number"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hardness gauge: Not OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    await waitFor(() => expect(m.createReadings).toHaveBeenCalled())
    expect(m.createReadings.mock.calls[0][0]).toEqual([{ quality_log_id: 500, quality_parameter_id: 1, observed_value: null, gauge_result: 'Not OK' }])
  })

  it('a Job Work row needs OK or Not OK before saving', async () => {
    await openReadings()
    fireEvent.click(screen.getByRole('button', { name: 'Save Inspection' }))
    expect(await screen.findByText(/Choose OK or Not OK for Hardness/)).toBeTruthy()
    expect(m.createLog).not.toHaveBeenCalled()
  })
})
