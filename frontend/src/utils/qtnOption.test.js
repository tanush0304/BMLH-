import { describe, it, expect } from 'vitest'
import { qtnOptionLabel, enquiryOptionsForOrder } from './qtnOption'

describe('qtnOptionLabel', () => {
  it('formats a revision with the rev number and a thousands-separated price', () => {
    const label = qtnOptionLabel({ qtn_no: 'QTN-004', revision_no: 1, part_name: 'HPV2 Rotor', quoted_price: 1027.8 })
    expect(label).toBe('QTN-004 (Rev 1) - HPV2 Rotor - 1,027.80')
  })

  it('omits the Rev suffix for a root enquiry', () => {
    const label = qtnOptionLabel({ qtn_no: 'QTN-001', revision_no: null, part_name: 'HPV3', quoted_price: 500 })
    expect(label).toBe('QTN-001 - HPV3 - 500.00')
  })

  it('drops missing parts cleanly', () => {
    expect(qtnOptionLabel({ qtn_no: 'QTN-002', revision_no: null, part_name: '', quoted_price: null })).toBe(
      'QTN-002'
    )
  })
})

describe('enquiryOptionsForOrder', () => {
  const ENQUIRIES = [
    { qtn_no: 'QTN-001', customer_id: 'CUST-001', part_serial_number: 'HPV2', revision_no: null, part_name: 'HPV2', quoted_price: 100 },
    { qtn_no: 'QTN-002', customer_id: 'CUST-001', part_serial_number: 'HPV2', revision_no: 1, part_name: 'HPV2', quoted_price: 110 },
    { qtn_no: 'QTN-003', customer_id: 'CUST-001', part_serial_number: 'HPV3', revision_no: null, part_name: 'HPV3', quoted_price: 200 },
    { qtn_no: 'QTN-004', customer_id: 'CUST-002', part_serial_number: 'HPV2', revision_no: null, part_name: 'HPV2', quoted_price: 300 },
  ]

  it('no customer selected -> no options', () => {
    expect(enquiryOptionsForOrder({ enquiries: ENQUIRIES, customerId: '', partSerialNumber: '' })).toEqual([])
  })

  it('a customer with no part chosen yet gets every one of their enquiries, newest QTN first', () => {
    const opts = enquiryOptionsForOrder({ enquiries: ENQUIRIES, customerId: 'CUST-001', partSerialNumber: '' })
    expect(opts.map((o) => o.value)).toEqual(['QTN-003', 'QTN-002', 'QTN-001'])
  })

  it('narrows to the selected part once one is chosen', () => {
    const opts = enquiryOptionsForOrder({ enquiries: ENQUIRIES, customerId: 'CUST-001', partSerialNumber: 'HPV2' })
    expect(opts.map((o) => o.value)).toEqual(['QTN-002', 'QTN-001'])
  })

  it('never crosses customers', () => {
    const opts = enquiryOptionsForOrder({ enquiries: ENQUIRIES, customerId: 'CUST-002', partSerialNumber: '' })
    expect(opts.map((o) => o.value)).toEqual(['QTN-004'])
  })
})
