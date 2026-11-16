// Bell source "Pending incoming QC" (055): supervisor / admin only, nothing
// before 055 or while the gate is off; Open -> Quality Inspection on the receipt.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const q = vi.hoisted(() => ({ supported: true, data: null }))
vi.mock('../../data/queries/jobworkQc', () => ({
  jobworkQcGateSupported: async () => q.supported,
  loadQcGateData: vi.fn(async () => q.data),
}))
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

const { pendingIncomingQcSource, ALERT_SOURCES } = await import('./alertSources')

const data = {
  settings: { on: true, from: null },
  stages: [
    { id: 4, prd_no: 'PRD-012', seq: 40, type: 'Outsourced', operation: 'Toughening' },
    { id: 5, prd_no: 'PRD-012', seq: 50, type: 'Internal', operation: 'Finish Turning ONE' },
  ],
  dispatches: [{ dc_no: 'DC-008', prd_no: 'PRD-012', stage_id: 4 }],
  receipts: [{ id: 8, dc_no: 'DC-008', receipt_no: 'JR-008', qty_received: 411, receipt_date: '2026-11-15', created_at: '2026-11-17T00:00:00Z' }],
  qcLogs: [],
  overrides: [],
}

beforeEach(() => {
  q.supported = true
  q.data = data
})

describe('pendingIncomingQcSource', () => {
  it('is registered, supervisor / admin only', () => {
    expect(ALERT_SOURCES).toContain(pendingIncomingQcSource)
    expect(pendingIncomingQcSource.roles).toEqual(['supervisor', 'admin'])
  })

  it('one item per waiting receipt; Open = Quality Inspection with qc:<receipt id>', async () => {
    const items = pendingIncomingQcSource.toItems(await pendingIncomingQcSource.load(), '2026-11-17')
    expect(items).toEqual([{
      id: 'qc:8',
      text: 'PRD-012 · Toughening · DC-008 / JR-008 · 411 pcs received 15-11-2026 -- no inspection yet',
      open: { topKey: 'quality', subKey: 'inspection', mode: 'qc:8' },
    }])
  })

  it('nothing before 055 or with the gate off', async () => {
    q.supported = false
    expect(pendingIncomingQcSource.toItems(await pendingIncomingQcSource.load())).toEqual([])
    q.supported = true
    q.data = { ...data, settings: { on: false, from: null } }
    expect(pendingIncomingQcSource.toItems(await pendingIncomingQcSource.load())).toEqual([])
  })
})
