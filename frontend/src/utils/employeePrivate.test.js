import { describe, it, expect } from 'vitest'
import { aadhaarInput, maskAadhaar, privateForm, privatePayload, privateErrorText, canSeePrivate } from './employeePrivate'

const PHONE = '98765 43210'
const AADHAAR = '4321'
const ADDRESS = '12 Secret Lane'

describe('Aadhaar last 4', () => {
  it('input keeps digits only, at most 4', () => {
    expect(aadhaarInput('12a3-4567')).toBe('1234')
    expect(aadhaarInput('')).toBe('')
  })
  it('always shown masked as XXXX XXXX 1234; nothing stored -> blank', () => {
    expect(maskAadhaar('1234')).toBe('XXXX XXXX 1234')
    expect(maskAadhaar(null)).toBe('')
  })
})

describe('privatePayload', () => {
  it('cleans phones (mobile 10 digits, landline with 0), trims address, blanks -> null', () => {
    expect(privatePayload('EMP-1', { phone_1: '+91 98765-43210', phone_2: '080-2345 6789', address: '  12 Main Rd ', aadhaar_last4: '1234' }))
      .toEqual({ payload: { employee_id: 'EMP-1', phone_1: '9876543210', phone_2: '08023456789', address: '12 Main Rd', aadhaar_last4: '1234' } })
    expect(privatePayload('EMP-1', { phone_1: '', phone_2: ' ', address: '', aadhaar_last4: '' }))
      .toEqual({ payload: { employee_id: 'EMP-1', phone_1: null, phone_2: null, address: null, aadhaar_last4: null } })
  })
  it('bad phone / aadhaar refused with the field; message never contains the typed value', () => {
    const p1 = privatePayload('EMP-1', { phone_1: '12345', aadhaar_last4: '' })
    expect(p1.field).toBe('phone_1')
    expect(p1.error).toMatch(/^Phone 1: Enter a valid 10-digit mobile/)
    expect(p1.error).not.toContain('12345')
    const p2 = privatePayload('EMP-1', { phone_2: '55555', aadhaar_last4: '' })
    expect(p2.field).toBe('phone_2')
    expect(p2.error).not.toContain('55555')
    const a = privatePayload('EMP-1', { aadhaar_last4: '987' })
    expect(a).toEqual({ error: 'Aadhaar: enter exactly the last 4 digits.', field: 'aadhaar_last4' })
  })
})

describe('privateErrorText: fixed texts by code, never the DB text', () => {
  const leaky = { message: `new row violates check constraint`, details: `Failing row contains (EMP-1, ${PHONE}, null, ${ADDRESS}, ${AADHAAR})` }
  it('maps codes', () => {
    expect(privateErrorText({ ...leaky, code: '23514' })).toBe('Check the personal details (Aadhaar last 4 must be 4 digits).')
    expect(privateErrorText({ code: '42501' })).toBe('You do not have permission to change personal details.')
    expect(privateErrorText({ rls: true })).toBe('You do not have permission to change personal details.')
    expect(privateErrorText({ code: '23503' })).toBe('Save the employee first.')
    expect(privateErrorText({ ...leaky, code: 'XX000' })).toBe('Could not save personal details.')
    expect(privateErrorText({}, 'load')).toBe('Could not load personal details.')
  })
  it('no value from the error ever comes through', () => {
    for (const code of ['23514', '42501', '23503', 'XX000', undefined]) {
      const t = privateErrorText({ ...leaky, code })
      for (const v of [PHONE, AADHAAR, ADDRESS]) expect(t).not.toContain(v)
    }
  })
})

describe('misc', () => {
  it('privateForm from a saved row; canSeePrivate = supervisor / admin', () => {
    expect(privateForm(null)).toEqual({ phone_1: '', phone_2: '', address: '', aadhaar_last4: '' })
    expect(privateForm({ phone_1: '9', aadhaar_last4: '1234' })).toMatchObject({ phone_1: '9', aadhaar_last4: '1234', address: '' })
    expect(canSeePrivate('supervisor')).toBe(true)
    expect(canSeePrivate('admin')).toBe(true)
    expect(canSeePrivate('operator')).toBe(false)
    expect(canSeePrivate(undefined)).toBe(false)
  })
})
