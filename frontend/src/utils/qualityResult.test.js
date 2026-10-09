import { describe, it, expect } from 'vitest'
import { computeQualityResult } from './qualityResult'

describe('computeQualityResult', () => {
  it('uses both tolerances when given', () => {
    expect(computeQualityResult(10, 0.5, 0.2, 10.5)).toBe('Accepted')
    expect(computeQualityResult(10, 0.5, 0.2, 9.8)).toBe('Accepted')
    expect(computeQualityResult(10, 0.5, 0.2, 9.7)).toBe('Not Accepted')
  })
  it('treats a blank tolerance as 0 on that side', () => {
    expect(computeQualityResult(10, null, 0.2, 10.01)).toBe('Not Accepted')
    expect(computeQualityResult(10, '', 0.2, 10)).toBe('Accepted')
    expect(computeQualityResult(10, 0.5, undefined, 9.99)).toBe('Not Accepted')
    expect(computeQualityResult(10, null, null, 10)).toBe('Accepted')
  })
  it('handles numeric strings without concatenating', () => {
    expect(computeQualityResult('10', '0.5', '', '10.4')).toBe('Accepted')
  })
  it('gives no result without a Standard or reading', () => {
    expect(computeQualityResult(null, 1, 1, 5)).toBeNull()
    expect(computeQualityResult(10, 1, 1, '')).toBeNull()
  })
})
