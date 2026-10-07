import { describe, expect, it } from 'vitest'
import {
  parsePositiveWipQuantity,
  validateWipIssueQuantity,
  validateWipIssueStages,
  validateWipReceiptStage,
} from './wipValidation'

const routeStages = [
  { id: 101, prd_no: 'PRD-101', seq: 1, type: 'Internal', status: 'Completed' },
  { id: 102, prd_no: 'PRD-101', seq: 2, type: 'Internal', status: 'Pending' },
  { id: 201, prd_no: 'PRD-202', seq: 1, type: 'Internal', status: 'Completed' },
  { id: 103, prd_no: 'PRD-101', seq: 3, type: 'Manual', status: 'Pending' },
]

describe('parsePositiveWipQuantity', () => {
  it('accepts positive finite decimal quantities', () => {
    expect(parsePositiveWipQuantity('2.5')).toBe(2.5)
    expect(parsePositiveWipQuantity(4)).toBe(4)
  })

  it.each(['', '  ', 'abc', '0', '-1', 'NaN', 'Infinity', '-Infinity', '0x10', null, undefined])(
    'rejects missing, invalid, non-finite, or non-positive quantity %s',
    (value) => expect(parsePositiveWipQuantity(value)).toBeNull()
  )
})

describe('validateWipReceiptStage', () => {
  it('accepts a completed stage on the selected PRD route card', () => {
    expect(validateWipReceiptStage('PRD-101', '101', [routeStages[0]])).toBeNull()
  })

  it('rejects an empty stage, another PRD stage, or a non-completed stage', () => {
    expect(validateWipReceiptStage('PRD-101', '', [routeStages[0]])).toMatch(/select a completed stage/i)
    expect(validateWipReceiptStage('PRD-101', 201, [routeStages[2]])).toMatch(/does not belong/i)
    expect(validateWipReceiptStage('PRD-101', 102, [])).toMatch(/does not belong/i)
  })
})

describe('validateWipIssueStages', () => {
  it('keeps source and destination on the selected PRD route card', () => {
    const result = validateWipIssueStages('PRD-101', '101', '102', routeStages)
    expect(result.error).toBeNull()
    expect(result.sourceStage.id).toBe(101)
    expect(result.targetStage.id).toBe(102)
  })

  it('rejects missing, cross-PRD, and disallowed Manual stages', () => {
    expect(validateWipIssueStages('', 101, 102, routeStages).error).toMatch(/Production Order/i)
    expect(validateWipIssueStages('PRD-101', 201, 102, routeStages).error).toMatch(/source/i)
    expect(validateWipIssueStages('PRD-101', 101, 201, routeStages).error).toMatch(/destination/i)
    expect(validateWipIssueStages('PRD-101', 101, 103, routeStages).error).toMatch(/destination/i)
  })
})

describe('validateWipIssueQuantity', () => {
  it('accepts quantity at or below the selected source-stage balance', () => {
    expect(validateWipIssueQuantity('5', '5')).toEqual({ quantity: 5, error: null })
  })

  it('rejects quantities greater than that source-stage balance', () => {
    expect(validateWipIssueQuantity('5.1', 5).error).toMatch(/source stage/i)
  })

  it('rejects missing or invalid balances', () => {
    expect(validateWipIssueQuantity('1', null).error).toMatch(/unavailable/i)
  })
})
