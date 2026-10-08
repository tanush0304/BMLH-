import { describe, expect, it } from 'vitest'
import { nextSequenceNo } from './numbering'

describe('nextSequenceNo', () => {
  it('starts at 001 and pads to 3 digits', () => {
    expect(nextSequenceNo('JC', [])).toBe('JC-001')
    expect(nextSequenceNo('DC', ['DC-009'])).toBe('DC-010')
  })

  it('compares the numeric part, not text', () => {
    expect(nextSequenceNo('JC', ['JC-999', 'JC-100'])).toBe('JC-1000')
    // As text "JC-999" > "JC-1000"; numerically 1000 is the max.
    expect(nextSequenceNo('PRD', ['PRD-999', 'PRD-1000', 'PRD-998'])).toBe('PRD-1001')
  })

  it('ignores values that do not match the shape', () => {
    expect(nextSequenceNo('PRD', ['PRD-HPV-A', 'PRD-004', null])).toBe('PRD-005')
    expect(nextSequenceNo('DC', ['DC-HPV-BR-01', 'DC-001-BR-PRD004'])).toBe('DC-001')
  })
})
