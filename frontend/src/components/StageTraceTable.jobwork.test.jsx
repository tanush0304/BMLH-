// @vitest-environment jsdom
// 2026-11-15: Order Traceability stage table -- an outsourced stage whose DCs
// are all back shows Received even while its stored status is still Pending
// (live PRD-010 stage 6: DC-004 353/353 + DC-006 46/46, PRD qty 500).
// Queries mocked; no network.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const dcRows = vi.hoisted(() => ({ rows: [] }))
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../data/queries/customerOrders', () => ({ listOrdersByPrd: async () => [{ prd_no: 'PRD-010', prd_qty: 500 }] }))
vi.mock('../data/queries/routeCards', () => ({
  getStagesForPrd: async () => [
    { id: 11, prd_no: 'PRD-010', seq: 6, operation: 'Broaching', type: 'Outsourced', status: 'Pending' },
  ],
}))
vi.mock('../data/queries/productionLogs', () => ({ getStageAggregatesForPrd: async () => ({}), listLogsForPrd: async () => [] }))
vi.mock('../data/queries/wip', () => ({ getWipAggregatesForPrd: async () => ({}) }))
vi.mock('../data/queries/jobOrders', () => ({ listJobOrderStatus: async () => dcRows.rows }))
vi.mock('../utils/calculations', () => ({ computeStageAvailability: () => ({ 11: dcRows.notSent ?? 0 }) }))

const { default: StageTraceTable } = await import('./StageTraceTable')
afterEach(() => cleanup())

const dc = (dc_no, qty, qty_received) => ({ dc_no, stage_id: 11, qty, qty_received })

describe('Order Traceability -- outsourced stage status from its DCs', () => {
  it('every DC back -> Received (was "Partially Received")', async () => {
    dcRows.rows = [dc('DC-004', 353, 353), dc('DC-006', 46, 46)]
    dcRows.notSent = 0
    render(<StageTraceTable prdNo="PRD-010" title="Stages" />)
    expect(await screen.findByText('399 sent · 399 received · DC-004, DC-006')).toBeTruthy()
    expect(screen.getByText('Received')).toBeTruthy()
    expect(screen.queryByText('Partially Received')).toBeNull()
  })

  it('one DC still partly out -> Partially Received', async () => {
    dcRows.rows = [dc('DC-003', 138, 134)]
    dcRows.notSent = 0
    render(<StageTraceTable prdNo="PRD-010" title="Stages" />)
    expect(await screen.findByText('Partially Received')).toBeTruthy()
  })

  it('all sent DCs back but qty still to send -> Received + "not sent yet" info', async () => {
    dcRows.rows = [dc('DC-1', 200, 200)]
    dcRows.notSent = 300
    render(<StageTraceTable prdNo="PRD-010" title="Stages" />)
    expect(await screen.findByText('200 sent · 200 received · 300 not sent yet · DC-1')).toBeTruthy()
    expect(screen.getByText('Received')).toBeTruthy()
  })
})
