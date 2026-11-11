// 045: parts offered per customer (customer's + unassigned + current part
// always kept; everything before 045 / with no customer) and the QTN
// dropdown's part narrowing with the same rule.
import { describe, it, expect } from 'vitest'
import { partsForCustomer, partBelongsToOtherCustomer } from './productOptions'
import { enquiryOptionsForOrder } from './qtnOption'

const PRODUCTS = [
  { part_serial_number: 'A-1', customer_id: 'C1' },
  { part_serial_number: 'A-2', customer_id: 'C1' },
  { part_serial_number: 'B-1', customer_id: 'C2' },
  { part_serial_number: 'U-1', customer_id: null },
  { part_serial_number: 'U-2', customer_id: '  ' },
]
const serials = (list) => list.map((p) => p.part_serial_number)

describe('partsForCustomer', () => {
  it("customer's parts + unassigned (null or blank)", () => {
    expect(serials(partsForCustomer(PRODUCTS, 'C1'))).toEqual(['A-1', 'A-2', 'U-1', 'U-2'])
    expect(serials(partsForCustomer(PRODUCTS, 'C2'))).toEqual(['B-1', 'U-1', 'U-2'])
  })
  it('the current part is always kept, even when it belongs to another customer', () => {
    expect(serials(partsForCustomer(PRODUCTS, 'C1', 'B-1'))).toEqual(['A-1', 'A-2', 'B-1', 'U-1', 'U-2'])
  })
  it('no customer picked, or before 045 -> every part', () => {
    expect(partsForCustomer(PRODUCTS, '')).toHaveLength(5)
    expect(partsForCustomer(PRODUCTS, 'C1', '', { enabled: false })).toHaveLength(5)
    expect(partsForCustomer(null, 'C1')).toEqual([])
  })
})

describe('partBelongsToOtherCustomer', () => {
  it('true only for a part assigned to a different customer', () => {
    expect(partBelongsToOtherCustomer(PRODUCTS, 'B-1', 'C1')).toBe(true)
    expect(partBelongsToOtherCustomer(PRODUCTS, 'A-1', 'C1')).toBe(false)
    expect(partBelongsToOtherCustomer(PRODUCTS, 'U-1', 'C1')).toBe(false)
    expect(partBelongsToOtherCustomer(PRODUCTS, 'NOPE', 'C1')).toBe(false)
    expect(partBelongsToOtherCustomer(PRODUCTS, '', 'C1')).toBe(false)
    expect(partBelongsToOtherCustomer(PRODUCTS, 'B-1', '')).toBe(false)
    expect(partBelongsToOtherCustomer(PRODUCTS, 'B-1', 'C1', { enabled: false })).toBe(false)
  })
})

describe('enquiryOptionsForOrder with products (045)', () => {
  const ENQ = [
    { qtn_no: 'QTN-001', customer_id: 'C1', part_serial_number: 'A-1' },
    { qtn_no: 'QTN-002', customer_id: 'C1', part_serial_number: 'B-1' }, // part now belongs to C2
    { qtn_no: 'QTN-003', customer_id: 'C1', part_serial_number: 'U-1' },
    { qtn_no: 'QTN-004', customer_id: 'C1', part_serial_number: 'GONE' }, // part not in Product Master
    { qtn_no: 'QTN-005', customer_id: 'C2', part_serial_number: 'B-1' },
  ]
  const values = (opts) => opts.map((o) => o.value)

  it('before 045 (no products): unchanged -- every enquiry of the customer', () => {
    expect(values(enquiryOptionsForOrder({ enquiries: ENQ, customerId: 'C1' }))).toEqual(['QTN-004', 'QTN-003', 'QTN-002', 'QTN-001'])
  })
  it("leaves out enquiries whose part belongs to another customer; unknown parts kept", () => {
    expect(values(enquiryOptionsForOrder({ enquiries: ENQ, customerId: 'C1', products: PRODUCTS }))).toEqual(['QTN-004', 'QTN-003', 'QTN-001'])
  })
  it('the current QTN is always kept', () => {
    expect(values(enquiryOptionsForOrder({ enquiries: ENQ, customerId: 'C1', products: PRODUCTS, currentQtn: 'QTN-002' }))).toContain('QTN-002')
  })
  it('still narrowed by the picked part', () => {
    expect(values(enquiryOptionsForOrder({ enquiries: ENQ, customerId: 'C1', partSerialNumber: 'A-1', products: PRODUCTS }))).toEqual(['QTN-001'])
  })
})
