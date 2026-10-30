// @vitest-environment jsdom
// Job Order Status report: Status filter (Sent / Partially Received /
// Received / Partially Received (Closed) / Overdue). It narrows the KPIs,
// table and export rows; the status donut keeps the full mix; Reset clears it.
import { cloneElement } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'
import { filterByDcStatus, DC_STATUS_FILTER_OPTIONS } from '../../utils/reportOrders'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 300 }) }
})
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const DCS = [
  { dc_no: 'DC-1', prd_no: 'PRD-001', vendor_id: 'V1', job_work_code: 'JW1', qty: 10, qty_received: 0, status: 'Sent', is_overdue: true },
  { dc_no: 'DC-2', prd_no: 'PRD-001', vendor_id: 'V1', job_work_code: 'JW1', qty: 10, qty_received: 4, status: 'Partially Received', is_overdue: false },
  { dc_no: 'DC-3', prd_no: 'PRD-002', vendor_id: 'V1', job_work_code: 'JW1', qty: 10, qty_received: 10, status: 'Received', is_overdue: false },
  { dc_no: 'DC-4', prd_no: 'PRD-002', vendor_id: 'V1', job_work_code: 'JW1', qty: 10, qty_received: 8, status: 'Closed Short', is_overdue: false },
  { dc_no: 'DC-5', prd_no: 'PRD-003', vendor_id: 'V1', job_work_code: 'JW1', qty: 10, qty_received: 0, status: 'Sent', is_overdue: false },
]
vi.mock('../../data/queries/reports', () => ({ listJobOrderStatusRows: async () => DCS }))
vi.mock('../../data/queries/vendors', () => ({ listVendors: async () => [{ vendor_id: 'V1', vendor_name: 'Alpha' }] }))
vi.mock('../../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: async () => [{ job_work_code: 'JW1', type_of_job_work: 'Plating' }] }))
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options, ...rest }) => (
    <select aria-label={rest['aria-label']} value={value} onChange={(e) => onChange(e)}>
      <option value="" />
      {(options ?? []).map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  ),
}))

import JobOrderStatusScreen from './JobOrderStatusScreen'

afterEach(() => cleanup())

describe('filterByDcStatus', () => {
  const rows = DCS.map((d) => ({ ...d, overdue: d.is_overdue }))
  it('each option; Overdue is the flag (any open status); blank = all', () => {
    expect(filterByDcStatus(rows, '').map((r) => r.dc_no)).toEqual(['DC-1', 'DC-2', 'DC-3', 'DC-4', 'DC-5'])
    expect(filterByDcStatus(rows, 'Sent').map((r) => r.dc_no)).toEqual(['DC-1', 'DC-5'])
    expect(filterByDcStatus(rows, 'Partially Received').map((r) => r.dc_no)).toEqual(['DC-2'])
    expect(filterByDcStatus(rows, 'Received').map((r) => r.dc_no)).toEqual(['DC-3'])
    expect(filterByDcStatus(rows, 'Closed Short').map((r) => r.dc_no)).toEqual(['DC-4'])
    expect(filterByDcStatus(rows, 'Overdue').map((r) => r.dc_no)).toEqual(['DC-1'])
  })

  it('options in the requested order, Closed Short shown as "Partially Received (Closed)"', () => {
    expect(DC_STATUS_FILTER_OPTIONS.map((o) => o.label)).toEqual(['Sent', 'Partially Received', 'Received', 'Partially Received (Closed)', 'Overdue'])
    expect(DC_STATUS_FILTER_OPTIONS.find((o) => o.label === 'Partially Received (Closed)').value).toBe('Closed Short')
  })
})

const kpi = (label) => screen.getByText(label).closest('[class*="rounded"]').textContent
const tableRows = () => screen.getAllByRole('row').filter((r) => /DC-\d/.test(r.textContent))

describe('Job Order Status report Status filter', () => {
  it('narrows KPIs and table, leaves the donut full, Reset clears it', async () => {
    render(<JobOrderStatusScreen />)
    await waitFor(() => expect(tableRows()).toHaveLength(5))
    expect(kpi('Total Job Orders')).toContain('5')

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'Sent' } })
    fireEvent.click(screen.getByRole('button', { name: /Search/ }))
    await waitFor(() => expect(tableRows()).toHaveLength(2))
    expect(tableRows().map((r) => r.textContent.match(/DC-\d/)[0])).toEqual(['DC-1', 'DC-5'])
    expect(kpi('Total Job Orders')).toContain('2')
    // Donut keeps the full mix: its centre total is still 5 and Received still listed.
    const donut = screen.getByText('Job Order Status (By Count)').closest('section, div[class*="rounded"]')
    expect(within(donut).getByText('Job Orders').parentElement.textContent).toContain('5')

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'Overdue' } })
    fireEvent.click(screen.getByRole('button', { name: /Search/ }))
    await waitFor(() => expect(tableRows()).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))
    await waitFor(() => expect(tableRows()).toHaveLength(5))
    expect(screen.getByRole('combobox', { name: 'Status' }).value).toBe('')
  })
})
