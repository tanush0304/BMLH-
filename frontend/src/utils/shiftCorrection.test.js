import { describe, expect, it, vi } from 'vitest'
import {
  CORRECTION_FIELDS,
  correctBlockedReason,
  currentCorrectors,
  correctionPatch,
  correctionChanges,
  correctionError,
  saveCorrection,
  shiftCorrectionErrorMessage,
  correctedByText,
  editedHourTitle,
} from './shiftCorrection'
import { approveBlockedReason } from './shiftVerification'

const ME = 'sup-1'
const OTHER = 'sup-2'
const hour = (over = {}) => ({
  id: 1, hour_slot: 1, log_id: 9, qty_produced: 10, qty_rejected: 1, qty_rework: 0,
  opr_issue: 0, program_issue: 0, tool_issue: 0, power_issue: 0, inspection: 0, breakdown: 0, mc_clean: 0, lunch: 0,
  remarks: null, entered_by: 'op-1', edited_by: null, edited_at: null, ...over,
})
const row = (over = {}) => ({
  log_id: 9, log_is_open: false, status: 'Rejected', verification_updated_at: '2026-10-19T10:00:00Z',
  enteredBy: ['op-1'], hourRows: [hour()], ...over,
})

describe('Correct on a closed log (035)', () => {
  it('only supervisor / admin', () => {
    expect(correctBlockedReason(row(), 'operator', 'op-1')).toMatch(/supervisor or admin/)
    expect(correctBlockedReason(row(), 'supervisor', ME)).toBeNull()
    expect(correctBlockedReason(row(), 'admin', ME)).toBeNull()
  })

  it('open-log shift: no Correct here (operator flow in Data Entry)', () => {
    expect(correctBlockedReason(row({ log_is_open: true }), 'supervisor', ME)).toMatch(/still open/)
  })

  it('only Rejected, or Pending mid-correction by the same supervisor', () => {
    expect(correctBlockedReason(row({ status: 'Pending' }), 'supervisor', ME)).toBe('Only a Rejected shift can be corrected -- this shift is Pending.')
    const mid = row({ status: 'Pending', hourRows: [hour({ edited_by: ME, edited_at: '2026-10-19T10:00:00Z' })] })
    expect(currentCorrectors(mid)).toEqual([ME])
    expect(correctBlockedReason(mid, 'supervisor', ME)).toBeNull()
    expect(correctBlockedReason(mid, 'supervisor', OTHER)).toBe('Another supervisor is correcting this shift.')
  })

  it('an earlier correction (before a re-reject / reset) does not count', () => {
    const old = row({ status: 'Pending', hourRows: [hour({ edited_by: OTHER, edited_at: '2026-10-18T09:00:00Z' })] })
    expect(currentCorrectors(old)).toEqual([])
  })

  it('patch has only the editable fields that changed', () => {
    const draft = { qty_produced: '8', qty_rejected: 1, qty_rework: '', remarks: ' recount ', breakdown: '5',
      entered_by: 'x', edited_by: 'x', edited_at: 'x', previous_qty_produced: 3, updated_at: 'x', log_id: 2, hour_slot: 4 }
    expect(correctionPatch(hour(), draft)).toEqual({ qty_produced: 8, remarks: 'recount', breakdown: 5 })
    expect(CORRECTION_FIELDS).toHaveLength(12)
    for (const k of ['entered_by', 'edited_by', 'edited_at', 'updated_at', 'log_id', 'hour_slot']) expect(CORRECTION_FIELDS).not.toContain(k)
  })

  it('changes in hour order, unchanged rows left out', () => {
    const hours = [hour({ id: 2, hour_slot: 2 }), hour({ id: 1, hour_slot: 1 }), hour({ id: 3, hour_slot: 3 })]
    const changes = correctionChanges(hours, { 3: { qty_produced: 12 }, 1: { qty_rework: 2 }, 2: { qty_produced: 10 } })
    expect(changes).toEqual([
      { id: 1, hour_slot: 1, patch: { qty_rework: 2 } },
      { id: 3, hour_slot: 3, patch: { qty_produced: 12 } },
    ])
  })

  it('validation: idle <= 60, rejected + rework <= produced, no negatives', () => {
    expect(correctionError([hour()], { 1: { lunch: 30, breakdown: 40 } })).toMatch(/70 \(max 60\)/)
    expect(correctionError([hour()], { 1: { qty_rejected: 8, qty_rework: 5 } })).toMatch(/more than produced/)
    expect(correctionError([hour()], { 1: { qty_produced: -1 } })).toMatch(/0 or more/)
    expect(correctionError([hour()], { 1: { qty_produced: 12 } })).toBeNull()
  })

  it('saves one row per request in order and stops at the first failure', async () => {
    const update = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ code: '23514', message: 'Accepted qty can be lowered by at most 3 -- the next stage (Stage 2) has already taken the rest' })
    const changes = [
      { id: 1, hour_slot: 1, patch: { qty_produced: 9 } },
      { id: 2, hour_slot: 2, patch: { qty_produced: 4 } },
      { id: 3, hour_slot: 3, patch: { qty_produced: 7 } },
    ]
    const result = await saveCorrection(changes, update)
    expect(update.mock.calls).toEqual([[1, { qty_produced: 9 }], [2, { qty_produced: 4 }]])
    expect(result).toEqual({ saved: [1], failed: { hour_slot: 2, message: 'Accepted qty can be lowered by at most 3 -- the next stage (Stage 2) has already taken the rest' } })
  })

  it('DB messages shown as written; bare permission denied translated', () => {
    expect(shiftCorrectionErrorMessage({ code: '42501', message: 'Another supervisor is correcting this shift' })).toBe('Another supervisor is correcting this shift')
    expect(shiftCorrectionErrorMessage({ code: '23514', message: 'Produced qty can be raised by at most 4 -- that is all this stage still has available' })).toMatch(/at most 4/)
    expect(shiftCorrectionErrorMessage({ code: '42501', message: 'permission denied for table production log hours' })).toMatch(/supervisor or admin only/)
    expect(shiftCorrectionErrorMessage({})).toBe('Could not save the correction.')
  })

  it('the corrector cannot approve', () => {
    const corrected = row({ status: 'Pending', enteredBy: ['op-1', ME], hourRows: [hour({ edited_by: ME, edited_at: '2026-10-19T10:00:00Z', entered_by: ME })] })
    expect(approveBlockedReason(corrected, ME)).toBe('You corrected this shift -- another supervisor or admin must approve it.')
    expect(approveBlockedReason(corrected, OTHER)).toBeNull()
  })

  it('"Corrected by X" line and Edited hover with old -> new', () => {
    const users = [{ user_id: ME, employee_name: 'Ravi' }]
    const h = hour({ edited_by: ME, edited_at: '2026-10-19T10:00:00Z', qty_produced: 8, previous_qty_produced: 10, qty_rejected: 2, previous_qty_rejected: 1 })
    expect(correctedByText(row({ status: 'Pending', hourRows: [h] }), users)).toBe('Corrected by Ravi — needs another supervisor/admin to approve')
    expect(correctedByText(row(), users)).toBe('')
    expect(editedHourTitle(h, users)).toMatch(/^Edited by Ravi on .+: Produced 10 → 8, Rejected 1 → 2$/)
    expect(editedHourTitle(hour())).toBe('')
  })
})
