import { describe, it, expect } from 'vitest'
import { aadhaarDigits, formatAadhaar, verhoeffValid, verhoeffCheckDigit, aadhaarProblem, AADHAAR_INVALID, AADHAAR_LENGTH } from './aadhaar'

// Synthetic numbers only (built with the algorithm) -- never a real person's.
const withCheck = (eleven) => `${eleven}${verhoeffCheckDigit(eleven)}`
const VALID = withCheck('23456789012')
const VALID2 = withCheck('98765432109')
const wrongCheck = (n) => `${n.slice(0, 11)}${(Number(n[11]) + 1) % 10}`

describe('Verhoeff', () => {
  it('standard vectors: 236 -> 3; 12345 -> 1; 142857 -> 0', () => {
    expect(verhoeffCheckDigit('236')).toBe(3)
    expect(verhoeffValid('2363')).toBe(true)
    expect(verhoeffCheckDigit('12345')).toBe(1)
    expect(verhoeffValid('123451')).toBe(true)
    expect(verhoeffCheckDigit('142857')).toBe(0)
  })
  it('catches a changed digit and a swap of neighbours', () => {
    expect(verhoeffValid(VALID)).toBe(true)
    expect(verhoeffValid(wrongCheck(VALID))).toBe(false)
    const swapped = VALID.slice(0, 3) + VALID[4] + VALID[3] + VALID.slice(5)
    if (swapped !== VALID) expect(verhoeffValid(swapped)).toBe(false)
    expect(verhoeffValid('12ab')).toBe(false)
  })
})

describe('input + display', () => {
  it('digits only, at most 12', () => {
    expect(aadhaarDigits('2345 6789-0123 99')).toBe('234567890123')
    expect(aadhaarDigits('ab12')).toBe('12')
    expect(aadhaarDigits(null)).toBe('')
  })
  it('formatted "1234 5678 9012" (partial input grouped as typed)', () => {
    expect(formatAadhaar('234567890123')).toBe('2345 6789 0123')
    expect(formatAadhaar('23456')).toBe('2345 6')
    expect(formatAadhaar('2345')).toBe('2345')
    expect(formatAadhaar('')).toBe('')
  })
})

describe('aadhaarProblem', () => {
  it('blank allowed; exactly 12 digits; first digit 2-9; Verhoeff', () => {
    expect(aadhaarProblem('')).toBeNull()
    expect(aadhaarProblem(VALID)).toBeNull()
    expect(aadhaarProblem(formatAadhaar(VALID2))).toBeNull() // spaces ignored
    expect(aadhaarProblem(VALID.slice(0, 11))).toBe(AADHAAR_LENGTH)
    expect(aadhaarProblem(`${VALID}1`)).toBe(AADHAAR_LENGTH)
    expect(aadhaarProblem(wrongCheck(VALID))).toBe(AADHAAR_INVALID)
    expect(AADHAAR_INVALID).toBe('This is not a valid Aadhaar number.')
    for (const first of ['0', '1']) {
      const n = withCheck(`${first}3456789012`) // checksum fine, first digit not allowed
      expect(verhoeffValid(n)).toBe(true)
      expect(aadhaarProblem(n)).toBe(AADHAAR_INVALID)
    }
  })
  it('messages never contain the number', () => {
    for (const n of [VALID.slice(0, 11), wrongCheck(VALID), withCheck('13456789012')]) {
      const msg = aadhaarProblem(n)
      expect(msg).not.toContain(n)
      expect(msg).not.toContain(n.slice(-4))
    }
  })
})
