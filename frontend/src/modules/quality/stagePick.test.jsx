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
  listQualityInspectionHistory: async () => [],
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
