import { describe, it, expect, vi } from 'vitest'
import {
  overdueDcItems, daysBetween, dcFromMode, loadAlertGroups, alertCount, canSeeAlerts,
  hasDismissedAlerts, rememberDismissedAlerts,
} from './alerts'

const TODAY = '2026-11-07'
const rows = [
  { dc_no: 'DC-004', prd_no: 'PRD-002', job_work_code: 'JW-1', vendor_id: 'VEN-1', qty: 300, qty_received: 100, balance_qty: 200, dispatch_date: '2026-10-20', expected_receipt_date: '2026-10-30', is_open: true, is_overdue: true },
  { dc_no: 'DC-005', prd_no: 'PRD-003', job_work_code: 'JW-2', vendor_id: 'VEN-2', qty: 50, qty_received: null, balance_qty: 50, dispatch_date: '2026-11-01', expected_receipt_date: '2026-11-06', is_open: true, is_overdue: true },
  { dc_no: 'DC-006', is_open: true, is_overdue: false, expected_receipt_date: '2026-11-07' }, // due today = not overdue
  { dc_no: 'DC-007', is_open: false, is_overdue: false, expected_receipt_date: '2026-10-01' }, // closed
]
const vendors = [{ vendor_id: 'VEN-1', vendor_name: 'Alpha Platers' }, { vendor_id: 'VEN-2', vendor_name: 'Beta Heat' }]
const orders = [{ prd_no: 'PRD-002', part_serial_number: '00190', part_name: 'Shaft' }]
const jobWorkTypes = [{ job_work_code: 'JW-1', lead_time_days: 10 }, { job_work_code: 'JW-2', lead_time_days: null }]

describe('overdueDcItems', () => {
  const items = overdueDcItems({ statusRows: rows, vendors, orders, jobWorkTypes, today: TODAY })

  it('lists only open + overdue DCs, most overdue first', () => {
    expect(items.map((i) => i.id)).toEqual(['dc:DC-004', 'dc:DC-005'])
  })

  it('builds the reminder text', () => {
    expect(items[0].text).toBe('DC-004 · Alpha Platers · 00190 – Shaft · overdue by 8 days (expected 30-10-2026, lead time 10 days) · 200 pcs')
  })

  it('falls back to expected - dispatch for lead time and to the PRD for the part; 1 day singular', () => {
    expect(items[1].text).toBe('DC-005 · Beta Heat · PRD-003 · overdue by 1 day (expected 06-11-2026, lead time 5 days) · 50 pcs')
  })

  it('Open goes to Jobwork Receipt with the DC', () => {
    expect(items[0].open).toEqual({ topKey: 'job-order', subKey: 'receipt', mode: 'dc:DC-004' })
    expect(dcFromMode(items[0].open.mode)).toBe('DC-004')
    expect(dcFromMode('issue')).toBeNull()
    expect(dcFromMode(null)).toBeNull()
  })

  it('no overdue DCs -> empty; missing names still list the DC', () => {
    expect(overdueDcItems({ statusRows: rows.slice(2), today: TODAY })).toEqual([])
    const bare = overdueDcItems({ statusRows: [rows[0]], today: TODAY })
    expect(bare[0].text).toContain('DC-004 · VEN-1 · PRD-002 · overdue by 8 days')
  })

  it('daysBetween', () => {
    expect(daysBetween('2026-10-30', '2026-11-07')).toBe(8)
    expect(daysBetween(null, '2026-11-07')).toBeNull()
  })
})

describe('loadAlertGroups', () => {
  const ok = { key: 'a', title: 'A', load: async () => [1, 2], toItems: (d) => d.map((n) => ({ id: String(n) })) }
  const bad = { key: 'b', title: 'B', load: async () => { throw new Error('boom') }, toItems: () => [] }
  const empty = { key: 'c', title: 'C', load: async () => [], toItems: () => [] }

  it('supervisor/admin only by default', async () => {
    expect(canSeeAlerts('operator')).toBe(false)
    expect(canSeeAlerts('supervisor')).toBe(true)
    expect(canSeeAlerts('admin')).toBe(true)
    expect(await loadAlertGroups('operator', [ok])).toEqual([])
  })

  it('skips a failing source, drops empty groups, counts items', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const groups = await loadAlertGroups('admin', [ok, bad, empty])
    expect(groups.map((g) => g.key)).toEqual(['a'])
    expect(alertCount(groups)).toBe(2)
    warn.mockRestore()
  })
})

describe('Got it (sessionStorage)', () => {
  function memory() {
    const m = new Map()
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
  }
  it('remembers per user', () => {
    const s = memory()
    expect(hasDismissedAlerts('u1', s)).toBe(false)
    rememberDismissedAlerts('u1', s)
    expect(hasDismissedAlerts('u1', s)).toBe(true)
    expect(hasDismissedAlerts('u2', s)).toBe(false)
  })
  it('storage that throws never breaks anything', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(() => rememberDismissedAlerts('u1', broken)).not.toThrow()
    expect(hasDismissedAlerts('u1', broken)).toBe(false)
  })
})
