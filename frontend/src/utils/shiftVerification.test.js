import { describe, expect, it } from 'vitest'
import {
  buildShiftRows,
  filterShiftRows,
  approveBlockedReason,
  decisionText,
  isShiftLocked,
  formatStamp,
  markRejectedPending,
} from './shiftVerification'
import { computeLiveLogTotals } from './productionReport'

const D = '2026-10-12'
const machines = [
  { machine_id: 'MC-001', machine_name: 'Lathe' },
  { machine_id: 'MC-002', machine_name: 'VMC' },
]
const logs = [
  { id: 1, machine_id: 'MC-001', prd_no: 'PRD-1', stage_id: 10 },
  { id: 2, machine_id: null, prd_no: 'PRD-1', stage_id: 11 },
]
const stages = [
  { id: 10, seq: 1, operation: 'Turning' },
  { id: 11, seq: 2, operation: 'De-Burring' },
]
const hours = [
  { id: 100, log_id: 1, log_date: D, shift_code: 'A', hour_slot: 2, employee_id: 'E1', entered_by: 'u-op', qty_produced: 10, qty_rejected: 1, qty_rework: 1, lunch: 30 },
  { id: 101, log_id: 1, log_date: D, shift_code: 'A', hour_slot: 1, employee_id: 'E1', entered_by: 'u-op', qty_produced: 12, qty_rejected: 0, qty_rework: 0 },
  // same log, other shift -- not part of shift A
  { id: 102, log_id: 1, log_date: D, shift_code: 'B', hour_slot: 1, employee_id: 'E2', entered_by: 'u-op', qty_produced: 99 },
  { id: 103, log_id: 2, log_date: D, shift_code: 'A', hour_slot: 1, employee_id: 'E2', entered_by: 'u-sup', qty_produced: 5 },
]
const appUsers = [{ user_id: 'u-sup', employee_name: 'Ravi', email: 'ravi@x' }]

describe('buildShiftRows', () => {
  const build = (verifications = []) =>
    buildShiftRows({ logDate: D, shiftCode: 'A', machines, logs, hours, stages, verifications, appUsers })

  it('lists every machine, with "No entry" for machines without hours', () => {
    const { machineRows } = build()
    expect(machineRows.map((r) => [r.machine_id, r.status])).toEqual([
      ['MC-001', 'Pending'],
      ['MC-002', 'No entry'],
    ])
  })

  it('totals only the selected shift and sorts hour rows', () => {
    const [row] = build().machineRows
    expect(row.hours_entered).toBe(2)
    expect(row.produced).toBe(22)
    expect(row.accepted).toBe(20)
    expect(row.idle_min).toBe(30)
    expect(row.stage).toBe('Stage 1 – Turning')
    expect(row.hourRows.map((h) => h.hour_slot)).toEqual([1, 2])
  })

  it('puts Manual Operations logs (no machine) in their own section', () => {
    const { manualRows } = build()
    expect(manualRows).toHaveLength(1)
    expect(manualRows[0].operation).toBe('De-Burring')
  })

  it('shows the stored status and the approver by name', () => {
    const [row] = build([
      { log_id: 1, log_date: D, shift_code: 'A', status: 'Approved', verified_by: 'u-sup', verified_at: '2026-10-12T10:00:00' },
    ]).machineRows
    expect(row.status).toBe('Approved')
    expect(row.decided_by).toBe('Ravi')
  })

  it('a verification of another shift does not count', () => {
    const [row] = build([{ log_id: 1, log_date: D, shift_code: 'B', status: 'Approved', verified_by: 'u-sup' }]).machineRows
    expect(row.status).toBe('Pending')
  })
})

describe('filterShiftRows', () => {
  const { machineRows } = buildShiftRows({ logDate: D, shiftCode: 'A', machines, logs, hours, stages })
  it('filters by machine, status and employee (employee drops "No entry")', () => {
    expect(filterShiftRows(machineRows, { machineId: 'MC-002' })).toHaveLength(1)
    expect(filterShiftRows(machineRows, { status: 'No entry' })[0].machine_id).toBe('MC-002')
    expect(filterShiftRows(machineRows, { employeeId: 'E1' }).map((r) => r.machine_id)).toEqual(['MC-001'])
    expect(filterShiftRows(machineRows, { employeeId: 'E9' })).toEqual([])
  })
})

describe('approveBlockedReason', () => {
  const row = { log_id: 1, status: 'Pending', enteredBy: ['u-op'] }
  it('blocks approving your own entries, an approved row, or no entry', () => {
    expect(approveBlockedReason(row, 'u-sup')).toBeNull()
    expect(approveBlockedReason(row, 'u-op')).toMatch(/another supervisor/)
    expect(approveBlockedReason({ ...row, status: 'Approved' }, 'u-sup')).toMatch(/Already/)
    expect(approveBlockedReason({ log_id: null, enteredBy: [] }, 'u-sup')).toMatch(/No entry/)
  })
})

describe('decisionText / isShiftLocked', () => {
  it('describes the decision', () => {
    expect(decisionText({ status: 'Rejected', reject_reason: 'Qty wrong' })).toBe('Rejected: Qty wrong')
    expect(decisionText({ status: 'Approved', verified_by: 'u-sup', verified_at: '2026-10-12T10:05:00' }, appUsers)).toBe(
      `Approved by Ravi on ${formatStamp('2026-10-12T10:05:00')}`
    )
    expect(decisionText(undefined)).toBe('')
  })
  it('locks only Approved, and never for admin', () => {
    expect(isShiftLocked({ status: 'Approved' }, 'operator')).toBe(true)
    expect(isShiftLocked({ status: 'Approved' }, 'admin')).toBe(false)
    expect(isShiftLocked({ status: 'Rejected' }, 'operator')).toBe(false)
    expect(isShiftLocked(undefined, 'operator')).toBe(false)
  })
})

describe('computeLiveLogTotals with edited saved rows', () => {
  it('an edited row (same id) replaces the saved one instead of adding to it', () => {
    const saved = [
      { id: 1, qty_produced: 10, qty_rejected: 0, qty_rework: 0 },
      { id: 2, qty_produced: 10, qty_rejected: 0, qty_rework: 0 },
    ]
    const t = computeLiveLogTotals({ savedHours: saved, draftRows: [{ id: 2, qty_produced: 4 }, { qty_produced: 1 }] })
    expect(t.total_produced).toBe(15)
  })
})

describe('markRejectedPending', () => {
  it('puts only the saved Rejected shift back to Pending, reason cleared', () => {
    const rows = [
      { log_date: '2026-10-15', shift_code: 'SHIFT-B', status: 'Rejected', reject_reason: 'wrong qty' },
      { log_date: '2026-10-15', shift_code: 'SHIFT-A', status: 'Approved', reject_reason: null },
      { log_date: '2026-10-14', shift_code: 'SHIFT-B', status: 'Rejected', reject_reason: 'other day' },
    ]
    const out = markRejectedPending(rows, '2026-10-15', 'SHIFT-B')
    expect(out[0]).toMatchObject({ status: 'Pending', reject_reason: null })
    expect(out[1]).toBe(rows[1])
    expect(out[2]).toBe(rows[2])
  })
})
