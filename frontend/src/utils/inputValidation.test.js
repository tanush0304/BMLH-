import { describe, it, expect } from 'vitest'
import { validateNumber, validatePhone, PHONE_MESSAGE, NUMBER_RULES } from './numericFields'
import { trimTextFields, requiredMissing, codeTooLong, duplicateCodeError, checkMaster, productionBatchError } from './masterValidation'
import { orderLineError } from './orderValidation'
import { shiftTimesError } from './shiftCalculations'
import { friendlyDbMessage } from './dbErrors'

describe('validateNumber', () => {
  const qty = (v) => validateNumber(v, { label: 'Qty', ...NUMBER_RULES.QTY })
  it('accepts valid values and blank when optional', () => {
    expect(qty('10')).toBeNull()
    expect(qty(' 12 ')).toBeNull()
    expect(qty('')).toBeNull()
    expect(qty('1000000')).toBeNull()
  })
  it('refuses 0, negative, decimal, huge, text and commas', () => {
    expect(qty('0')).toMatch(/greater than 0/)
    expect(qty('-5')).toMatch(/greater than 0/)
    expect(qty('2.5')).toMatch(/whole number/)
    expect(qty('1e12')).toMatch(/more than 10,00,000/)
    expect(qty('abc')).toMatch(/must be a number/)
    expect(qty('1,000')).toMatch(/no commas/)
  })
  it('required blank', () => {
    expect(validateNumber('  ', { label: 'Order Qty', required: true })).toBe('Order Qty is required.')
  })
  it('shift hours, setting time and lead time limits', () => {
    const hrs = (v) => validateNumber(v, { label: 'Shift Hours', ...NUMBER_RULES.SHIFT_HOURS })
    expect(hrs('7.5')).toBeNull()
    expect(hrs('0')).toMatch(/greater than 0/)
    expect(hrs('1e12')).toMatch(/more than 24/)
    const set = (v) => validateNumber(v, { label: 'Setting Time', ...NUMBER_RULES.SETTING_TIME })
    expect(set('0')).toBeNull()
    expect(set('1441')).toMatch(/more than 1,440/)
    expect(set('2.5')).toMatch(/whole number/)
    const lead = (v) => validateNumber(v, { label: 'Lead Time', ...NUMBER_RULES.LEAD_TIME })
    expect(lead('0')).toMatch(/greater than 0/)
    expect(lead('366')).toMatch(/more than 365/)
  })
})

describe('validatePhone', () => {
  it('cleans a mobile (+91, 91, leading 0, spaces, dashes, brackets) to 10 digits', () => {
    expect(validatePhone('+91 98765-43210')).toEqual({ value: '9876543210', error: null })
    expect(validatePhone('919876543210')).toEqual({ value: '9876543210', error: null })
    expect(validatePhone('09876543210')).toEqual({ value: '9876543210', error: null })
    expect(validatePhone(' 98765 43210 ')).toEqual({ value: '9876543210', error: null })
    expect(validatePhone('(+91) 98765 43210')).toEqual({ value: '9876543210', error: null })
  })
  it('accepts a landline with STD code and keeps the leading 0', () => {
    expect(validatePhone('080-2345 6789')).toEqual({ value: '08023456789', error: null })
    expect(validatePhone('(0821) 234567')).toEqual({ value: '0821234567', error: null })
    expect(validatePhone('080-23456789')).toEqual({ value: '08023456789', error: null })
    expect(validatePhone('080 2345 6789')).toEqual({ value: '08023456789', error: null })
    expect(validatePhone('0821234567')).toEqual({ value: '0821234567', error: null })
  })
  it('a plain 0 + 10-digit mobile (no STD group) stays a mobile', () => {
    expect(validatePhone('08023456789')).toEqual({ value: '8023456789', error: null })
    expect(validatePhone('0 98765 43210')).toEqual({ value: '9876543210', error: null })
  })
  it('refuses text, wrong length, landlines without STD 0 and mobiles not starting 6-9', () => {
    expect(validatePhone('abc').error).toBe(PHONE_MESSAGE)
    expect(validatePhone('12345').error).toBe(PHONE_MESSAGE)
    expect(validatePhone('5876543210').error).toBe(PHONE_MESSAGE)
    expect(validatePhone('98765432101').error).toBe(PHONE_MESSAGE)
    expect(validatePhone('23456789').error).toBe(PHONE_MESSAGE)
    expect(validatePhone('080234').error).toBe(PHONE_MESSAGE)
    expect(validatePhone('080234567890').error).toBe(PHONE_MESSAGE)
    expect(PHONE_MESSAGE).toBe('Enter a valid 10-digit mobile or a landline with STD code (e.g. 080-23456789).')
  })
  it('blank is fine when optional, refused when required', () => {
    expect(validatePhone('')).toEqual({ value: '', error: null })
    expect(validatePhone('  ', { required: true }).error).toBe('Mobile Number is required.')
  })
})

describe('master validation helpers', () => {
  it('trims strings only', () => {
    expect(trimTextFields({ a: '  x ', b: 5, c: null })).toEqual({ a: 'x', b: 5, c: null })
  })
  it('required is checked after trimming', () => {
    expect(requiredMissing([{ key: 'name', label: 'Name', required: true }], { name: '   ' })?.label).toBe('Name')
    expect(requiredMissing([{ key: 'name', label: 'Name', required: true }], { name: 'A' })).toBeNull()
  })
  it('code length max 30', () => {
    expect(codeTooLong('X'.repeat(30))).toBeNull()
    expect(codeTooLong('X'.repeat(31), 'Customer ID')).toBe("Customer ID can't be longer than 30 characters.")
  })
  it('duplicate codes ignore case and surrounding spaces, message uses the stored spelling', () => {
    const existing = ['CUST-001', 'CUST-002']
    expect(duplicateCodeError('cust-001', existing)).toBe('CUST-001 already exists.')
    expect(duplicateCodeError(' CUST-001 ', existing)).toBe('CUST-001 already exists.')
    expect(duplicateCodeError('CUST-003', existing)).toBeNull()
  })
  it('checkMaster: required message, duplicate only for new, phones cleaned', () => {
    const base = {
      form: { id: ' V-9 ', name: ' Acme ', mobile: '+91 98765 43210' },
      records: [{ id: 'v-9' }],
      codeKey: 'id',
      codeLabel: 'Vendor ID',
      required: [{ key: 'id' }, { key: 'name' }],
      requiredMessage: 'ID and Name are required.',
      mobiles: [{ key: 'mobile', label: 'Mobile Number' }],
    }
    expect(checkMaster({ ...base, mode: 'new' }).error).toBe('v-9 already exists.')
    expect(checkMaster({ ...base, mode: 'edit' }).cleaned).toEqual({ id: 'V-9', name: 'Acme', mobile: '9876543210' })
    expect(checkMaster({ ...base, mode: 'new', form: { id: '  ', name: 'A' } }).error).toBe('ID and Name are required.')
    expect(checkMaster({ ...base, mode: 'edit', form: { id: 'V-9', name: 'A', mobile: 'abc' } }).error).toMatch(/10-digit/)
  })
  it('productionBatchError: one batch per part, qty whole number > 0', () => {
    const records = [{ part_serial_number: 'PART-101' }]
    expect(productionBatchError({ part_serial_number: '' }, 'new', records)).toBe('Part Serial Number is required.')
    expect(productionBatchError({ part_serial_number: 'PART-101' }, 'new', records)).toBe('PART-101 already has a batch size -- edit it instead.')
    expect(productionBatchError({ part_serial_number: 'PART-101', production_batch_quantity: '120' }, 'edit', records)).toBeNull()
    expect(productionBatchError({ part_serial_number: 'PART-102', production_batch_quantity: '-1' }, 'new', records)).toMatch(/greater than 0/)
  })
})

describe('orderLineError', () => {
  it('refuses decimal qty and delivery before PO date', () => {
    expect(orderLineError({ orderQty: '2.5', poDate: '2026-10-20' })).toMatch(/whole number/)
    expect(orderLineError({ orderQty: '10', poDate: '2026-10-20', expectedDelivery: '2026-01-01' })).toBe("Expected Delivery can't be before the PO Date.")
    expect(orderLineError({ orderQty: '10', poDate: '2026-10-20', expectedDelivery: '2026-10-20' })).toBeNull()
    expect(orderLineError({ orderQty: '10', poDate: '2026-10-20', expectedDelivery: '' })).toBeNull()
  })
})

describe('shiftTimesError', () => {
  it('requires both times, different, net > 0; overnight allowed', () => {
    expect(shiftTimesError({ start_time: '', end_time: '5:00 PM' })).toBe('Start Time and End Time are required.')
    expect(shiftTimesError({ start_time: '1:00 AM', end_time: '1:00 AM' })).toBe('Start Time and End Time must be different.')
    expect(shiftTimesError({ start_time: '9:00 AM', end_time: '9:30 AM', lunch_break_duration: '30 min' })).toMatch(/more than 0/)
    expect(shiftTimesError({ start_time: '10:00 PM', end_time: '6:00 AM', lunch_break_duration: '30' })).toBeNull()
    expect(shiftTimesError({ start_time: '8:00 AM', end_time: '5:00 PM' })).toBeNull()
  })
})

describe('friendlyDbMessage: number and foreign-key errors', () => {
  it('translates the raw Postgres messages', () => {
    expect(friendlyDbMessage('invalid input syntax for type integer: "2.5"')).toBe('Please enter a valid number.')
    expect(friendlyDbMessage('value "1000000000000" is out of range for type integer')).toBe('That number is too large.')
    expect(friendlyDbMessage('update or delete on table "products master" violates foreign key constraint "x_fkey" on table "y"')).toBe(
      "This record is used elsewhere (e.g. in orders, batches or routes) and can't be deleted."
    )
  })
})
