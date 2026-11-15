// 2026-11-15: no negative / fractional pieces in data entry (frontend rule;
// RM keeps decimals), and Reject % / Rework % = part x 100 / (good + rejected
// + rework) to 2 decimals.
import { describe, it, expect } from 'vitest'
import { validateHourQty, wholePiecesError, validateNumber, NUMBER_RULES } from './numericFields'
import { validateDispatchQuantity } from './finishedGoodsValidation'
import { validateWipIssueQuantity } from './wipValidation'
import { receiptQtyError, dispatchEditError, receiptEditError } from './jobwork'
import { correctionError } from './shiftCorrection'
import { lossPct, totals } from './reportAggregates'
import { computeLiveLogTotals } from './productionReport'

describe('validateHourQty', () => {
  it('blank = 0 is fine; whole numbers >= 0 pass', () => {
    expect(validateHourQty({ qty_produced: '', qty_rejected: '', qty_rework: '' })).toBeNull()
    expect(validateHourQty({ qty_produced: '10', qty_rejected: '1', qty_rework: '2' })).toBeNull()
    expect(validateHourQty({ qty_produced: 10, qty_rejected: 0, qty_rework: 0 })).toBeNull()
  })
  it('refuses negatives, decimals and junk with a clear message', () => {
    expect(validateHourQty({ qty_produced: '-5' }, 'Hour 3 ')).toBe("Hour 3 produced can't be less than 0.")
    expect(validateHourQty({ qty_produced: '5', qty_rejected: '-1' }, 'Hour 3 ')).toBe("Hour 3 rejected can't be less than 0.")
    expect(validateHourQty({ qty_produced: '2.5' }, 'Hour 1 ')).toBe('Hour 1 produced must be a whole number.')
    expect(validateHourQty({ qty_produced: '5', qty_rework: '0.5' }, 'Hour 1 ')).toBe('Hour 1 rework must be a whole number.')
    expect(validateHourQty({ qty_produced: 'abc' })).toMatch(/must be a number/)
  })
  it('rejected + rework cannot exceed produced', () => {
    expect(validateHourQty({ qty_produced: '5', qty_rejected: '3', qty_rework: '3' }, 'Hour 2 ')).toBe(
      "Hour 2 rejected + rework can't be more than produced.",
    )
  })
})

describe('pieces vs RM', () => {
  it('wholePiecesError flags fractions only', () => {
    expect(wholePiecesError('3')).toBeNull()
    expect(wholePiecesError('')).toBeNull()
    expect(wholePiecesError('3.5', 'Qty')).toBe('Qty must be a whole number.')
  })
  it('RM keeps decimals, pieces do not', () => {
    expect(validateNumber('2.75', { label: 'Qty', ...NUMBER_RULES.QTY_DECIMAL })).toBeNull()
    expect(validateNumber('-1', { label: 'Qty', ...NUMBER_RULES.QTY_DECIMAL })).toMatch(/greater than 0/)
    expect(validateNumber('2.75', { label: 'Qty', ...NUMBER_RULES.QTY_PIECES })).toBe('Qty must be a whole number.')
  })
  it('FG despatch, WIP issue, jobwork refuse fractions and negatives', () => {
    expect(validateDispatchQuantity('2.5', 10, 10).error).toBe('Despatch quantity must be a whole number.')
    expect(validateDispatchQuantity('-2', 10, 10).error).toMatch(/greater than zero/)
    expect(validateDispatchQuantity('2', 10, 10).error).toBeNull()
    expect(validateWipIssueQuantity('1.5', 10).error).toBe('Quantity must be a whole number.')
    expect(validateWipIssueQuantity('-1', 10).error).toMatch(/greater than zero/)
    expect(receiptQtyError('1.5', { qty: 10, qty_received: 0, dc_no: 'DC-1' })).toBe('Qty Received must be a whole number.')
    expect(receiptQtyError('-1', { qty: 10, qty_received: 0, dc_no: 'DC-1' })).toMatch(/greater than zero/)
    expect(dispatchEditError({ qty: '2.5', dispatch_date: 'x', vendor_id: 'V' }, { dc_no: 'DC-1' }, { min: 0, max: 10 })).toBe('Qty must be a whole number.')
    expect(receiptEditError({ qty_received: '2.5', receipt_date: 'x' }, { qty_received: 0, dc_no: 'DC-1' }, { qty: 10, qty_received: 0 })).toBe(
      'Qty Received must be a whole number.',
    )
  })
  it('Shift Verification correction refuses fractions and negatives', () => {
    const h = { id: 1, hour_slot: 2, qty_produced: 5, qty_rejected: 0, qty_rework: 0, opr_issue: 0, program_issue: 0, tool_issue: 0, power_issue: 0, inspection: 0, breakdown: 0, mc_clean: 0, lunch: 0, remarks: null }
    expect(correctionError([h], { 1: { qty_produced: '4.5' } })).toBe('Hour 2: values must be whole numbers.')
    expect(correctionError([h], { 1: { qty_produced: '-1' } })).toBe('Hour 2: values must be numbers of 0 or more.')
    expect(correctionError([h], { 1: { qty_produced: '4' } })).toBeNull()
  })
})

describe('Reject % / Rework % (2 decimals, part / (good + rejected + rework))', () => {
  it('lossPct', () => {
    expect(lossPct(1, 170, 1, 1)).toBe(0.58)
    expect(lossPct(0, 0, 0, 0)).toBeNull()
  })
  it('PRD-012 (live 2026-11-15): 3418 produced, 1 rejected, 1 rework -> 0.03 % (was 0.0)', () => {
    const t = totals([{ produced: 3418, rejected: 1, rework: 1 }])
    expect(t.reject_pct).toBe(0.03)
    expect(t.rework_pct).toBe(0.03)
  })
  it('log 89: 172 produced, 1 rejected, 1 rework -> 0.58 % (was 0.6)', () => {
    const t = computeLiveLogTotals({ savedHours: [{ id: 1, qty_produced: 172, qty_rejected: 1, qty_rework: 1 }] })
    expect(t.reject_pct).toBe(0.58)
    expect(t.rework_pct).toBe(0.58)
  })
  it('uses good_qty when the view row carries it', () => {
    expect(totals([{ produced: 100, rejected: 3, rework: 2, good_qty: 95 }]).reject_pct).toBe(3)
  })
})
