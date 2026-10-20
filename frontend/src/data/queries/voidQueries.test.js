import { beforeEach, describe, expect, it, vi } from 'vitest'

// Records every builder call; awaiting a builder gives an empty page.
const calls = []
function builder(table) {
  const b = {}
  for (const m of ['select', 'eq', 'is', 'lte', 'gte', 'order', 'range', 'in', 'limit']) {
    b[m] = (...args) => {
      calls.push([table, m, ...args])
      return b
    }
  }
  b.then = (resolve) => resolve({ data: [], error: null })
  return b
}
const rpc = vi.fn(async () => ({ data: 'GRN-004', error: null }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: (t) => builder(t), rpc: (...a) => rpc(...a) } }))

const { voidEntry } = await import('./voidEntries')
const { listFgTransactionsUpTo, listRmTransactionsUpTo, listWipTransactionsUpTo } = await import('./reports')
const { listDispatchesForPrd } = await import('./productionLogs')

const voidFilter = (table) => calls.some(([t, m, col, val]) => t === table && m === 'is' && col === 'voided_at' && val === null)

describe('void exclusions in direct reads (034)', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('rpc void_entry payload', async () => {
    await voidEntry('GRN', 'GRN-004', ' duplicate ')
    expect(rpc).toHaveBeenCalledWith('void_entry', { p_doc_type: 'GRN', p_doc_no: 'GRN-004', p_reason: 'duplicate' })
  })

  it('FG / RM report ledgers skip voided rows (report totals); WIP has no void column', async () => {
    await listFgTransactionsUpTo('2026-10-19')
    await listRmTransactionsUpTo('2026-10-19')
    await listWipTransactionsUpTo('2026-10-19')
    expect(voidFilter('finished goods transactions')).toBe(true)
    expect(voidFilter('raw material transactions')).toBe(true)
    expect(voidFilter('wip transactions')).toBe(false)
  })

  it('stage availability skips voided DCs', async () => {
    await listDispatchesForPrd('PRD-018')
    expect(voidFilter('job order dispatch')).toBe(true)
  })
})
