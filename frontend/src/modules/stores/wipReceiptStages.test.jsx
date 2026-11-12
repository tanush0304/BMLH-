// @vitest-environment jsdom
// WIP Receipt (2026-11-11, option B): the "Stage" dropdown offers Completed /
// Received stages as before PLUS any stage with WIP-receivable qty > 0
// ("· in progress · N available"); a Pending stage with nothing to receive
// is not offered. Qty ceiling unchanged.
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../data/queries/qualityLogs', () => ({ listPrdsWithRouteCard: async () => [{ prd_no: 'PRD-014' }] }))
vi.mock('../../data/queries/routeCards', () => ({
  getStagesForPrd: async () => [
    { id: 1, prd_no: 'PRD-014', seq: 1, position: 1, type: 'Internal', status: 'Pending', operation: 'Cutting' },
    { id: 2, prd_no: 'PRD-014', seq: 2, position: 2, type: 'Internal', status: 'Pending', operation: 'Turning' },
    { id: 3, prd_no: 'PRD-014', seq: 3, position: 3, type: 'Internal', status: 'Completed', operation: 'Facing' },
  ],
}))
vi.mock('../../data/queries/employees', () => ({ listEmployees: async () => [] }))
vi.mock('../../data/queries/shifts', () => ({ listShifts: async () => [] }))
vi.mock('../../data/queries/currentUser', () => ({ getCurrentUserId: async () => 'u1' }))
vi.mock('../../data/queries/wip', () => ({
  createWipReceipt: vi.fn(),
  updateWipTransaction: vi.fn(),
  listWipBalanceForPrd: async () => [],
  listWipTransactionsForPrd: async () => [],
}))
// Stage 1: 120 accepted, nothing taken yet -> 120 available; stage 2: none;
// stage 3 (Completed): 0 left -> still offered as before.
vi.mock('../../data/queries/productionLogs', () => ({
  getStageAggregatesForPrd: async () => ({ 1: { output: 130, accepted: 120, consumed: 0 }, 2: { output: 0, accepted: 0, consumed: 0 }, 3: { output: 0, accepted: 0, consumed: 0 } }),
}))
vi.mock('../../utils/usePartForPrd', () => ({ default: () => ({ part_serial_number: '', part_name: '', part_drawing_reference_number: '' }) }))
vi.mock('../../components/OrderLineFields', () => ({ default: () => null }))
vi.mock('../../components/StockEditPanel', () => ({
  default: () => null,
  useAppUsers: () => [],
  withEditedLabels: (rows) => rows,
  EDITED_COLUMN: { key: 'edited', label: 'Edited' },
}))
vi.mock('../../components/SearchableSelect', () => ({
  default: ({ value, onChange, options, disabled }) => (
    <select value={value} onChange={onChange} disabled={disabled}>
      <option value="" />
      {(options ?? []).map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o }
        return <option key={opt.value} value={opt.value}>{opt.label}</option>
      })}
    </select>
  ),
}))

const { default: WipReceiptScreen } = await import('./WipReceiptScreen')
afterEach(cleanup)

const control = (label) => within(screen.getAllByText(label, { selector: 'span' })[0].closest('label')).getByRole('combobox')

describe('WIP Receipt -- Stage options (option B)', () => {
  it('offers in-progress stages with something to receive, plus completed ones', async () => {
    render(<WipReceiptScreen role="supervisor" />)
    await waitFor(() => expect(within(control('PRD No')).queryByRole('option', { name: 'PRD-014' })).toBeTruthy())
    fireEvent.change(control('PRD No'), { target: { value: 'PRD-014' } })
    await waitFor(() => expect(within(control('Stage')).getAllByRole('option').length).toBeGreaterThan(1))
    const labels = within(control('Stage')).getAllByRole('option').map((o) => o.textContent).filter(Boolean)
    expect(labels).toEqual(['Stage 1 – Cutting · in progress · 120 available', 'Stage 3 – Facing'])
    expect(screen.queryByText('Completed Stage')).toBeNull()

    fireEvent.change(control('Stage'), { target: { value: '1' } })
    await waitFor(() => expect(screen.getByText('Qty (available to receive: 120)')).toBeTruthy())
  })
})
