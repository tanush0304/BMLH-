// @vitest-environment jsdom
// The single Quality Master form sends EXACTLY the same payload as before the
// bulk-entry refactor (buildPayload in utils/qualityBulk.js). Expected objects
// were captured from the form before the refactor -- toEqual, not toMatchObject.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({ create: vi.fn(async (p) => ({ id: 99, ...p })) }))
vi.mock('../../data/queries/qualityParameters', () => ({
  listQualityParameters: async () => [],
  createQualityParameter: m.create,
  createQualityParameters: vi.fn(),
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
vi.mock('../../data/queries/products', () => ({ listProducts: async () => [{ part_serial_number: 'P1', part_name: 'Shaft' }] }))
vi.mock('../../data/queries/machines', () => ({
  listMachines: async () => [{ machine_id: 'MC-004', machine_name: 'CNC 1', category: 'CNC' }],
}))
vi.mock('../../data/queries/cycleTimes', () => ({
  listCycleTimes: async () => [
    { part_serial_number: 'P1', machine_id: 'MC-004', operation: 'Rough Turning' },
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
const input = (text) => screen.getByText(text, { selector: 'span' }).closest('label').querySelector('input, select')
const type = (el, value) => fireEvent.change(el, { target: { value } })

async function start(appliesTo) {
  render(<QualityMaster />)
  await waitFor(() => screen.getByRole('radio', { name: 'Job Work' }))
  if (appliesTo) fireEvent.click(screen.getByRole('radio', { name: appliesTo })) // default = Machine Category
  pick(selectWith('P1'), 'P1')
}
async function save() {
  fireEvent.click(screen.getByRole('button', { name: /^save/i }))
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1))
  return m.create.mock.calls[0][0]
}

beforeEach(() => m.create.mockClear())
afterEach(() => cleanup())

describe('single form payload (unchanged by the bulk refactor)', () => {
  it('Measured, specific machine', async () => {
    await start('Specific Machine')
    pick(selectWith('MC-004'), 'MC-004')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    type(document.querySelector('input[list="quality-parameter-suggestions"]'), ' OD ')
    await waitFor(() => input('Check Type'))
    type(input('Standard'), '50')
    type(input('Upper Tolerance'), '0.1')
    type(input('Lower Tolerance'), '0.05')
    type(input('Instrument'), ' Micrometer ')
    type(input('Remarks'), ' check ')
    expect(await save()).toEqual({
      part_serial_number: 'P1', machine_id: 'MC-004', machine_category: null, job_work_code: null,
      type_of_operation: 'Rough Turning', quality_parameter: 'OD',
      standard: 50, upper_tolerance: 0.1, lower_tolerance: 0.05,
      check_type: 'Measured', gauge_ref: 'Micrometer', gauge_standard: null,
      expected_text_value: null, remarks: 'check',
    })
  })

  it('Gauge, machine category, text Standard + Instrument', async () => {
    await start(null)
    pick(selectWith('CNC'), 'CNC')
    pick(selectWith('Rough Turning'), 'Rough Turning')
    type(document.querySelector('input[list="quality-parameter-suggestions"]'), 'Thread')
    await waitFor(() => input('Check Type'))
    type(input('Check Type'), 'Gauge')
    type(input('Standard'), ' M8x1.25 6H ')
    type(input('Instrument'), ' PG-01 ')
    expect(await save()).toEqual({
      part_serial_number: 'P1', machine_id: null, machine_category: 'CNC', job_work_code: null,
      type_of_operation: 'Rough Turning', quality_parameter: 'Thread',
      standard: null, upper_tolerance: null, lower_tolerance: null,
      check_type: 'Gauge', gauge_ref: 'PG-01', gauge_standard: 'M8x1.25 6H',
      expected_text_value: null, remarks: null,
    })
  })

  it('Job Work', async () => {
    await start('Job Work')
    pick(selectWith('HT'), 'HT')
    pick(selectWith('Toughening'), 'Toughening')
    type(document.querySelector('input[list="quality-parameter-suggestions"]'), 'Hardness')
    await waitFor(() => input('Instrument'))
    type(input('Standard'), ' 58-62 HRC ')
    type(input('Instrument'), ' HT-01 ')
    expect(await save()).toEqual({
      part_serial_number: 'P1', machine_id: null, machine_category: null, job_work_code: 'HT',
      type_of_operation: 'Toughening', quality_parameter: 'Hardness',
      standard: null, upper_tolerance: null, lower_tolerance: null,
      check_type: 'Gauge', gauge_ref: 'HT-01', gauge_standard: '58-62 HRC',
      expected_text_value: null, remarks: null,
    })
  })
})
