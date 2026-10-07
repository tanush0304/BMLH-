import { describe, it, expect } from 'vitest'
import { deriveEnquiryStatuses } from './enquiryStatus'

describe('deriveEnquiryStatuses', () => {
  it('a root enquiry with no orders and no revisions is Open', () => {
    const r = deriveEnquiryStatuses([{ qtn_no: 'QTN-001', parent_qtn_no: null, revision_no: null }], [])
    expect(r.get('QTN-001')).toEqual({ status: 'Open', linkedPrds: [] })
  })

  it('an enquiry referenced by a customer order is Ordered, with its PRDs listed', () => {
    const enquiries = [{ qtn_no: 'QTN-001', parent_qtn_no: null, revision_no: null }]
    const orders = [
      { qtn_no: 'QTN-001', prd_no: 'PRD-010' },
      { qtn_no: 'QTN-001', prd_no: 'PRD-011' },
      { qtn_no: 'QTN-999', prd_no: 'PRD-999' },
    ]
    const r = deriveEnquiryStatuses(enquiries, orders)
    expect(r.get('QTN-001')).toEqual({ status: 'Ordered', linkedPrds: ['PRD-010', 'PRD-011'] })
  })

  it('a root with a later revision (and no order of its own) is Superseded', () => {
    const enquiries = [
      { qtn_no: 'QTN-001', parent_qtn_no: null, revision_no: null },
      { qtn_no: 'QTN-002', parent_qtn_no: 'QTN-001', revision_no: 1 },
    ]
    const r = deriveEnquiryStatuses(enquiries, [])
    expect(r.get('QTN-001')).toEqual({ status: 'Superseded', linkedPrds: [] })
    expect(r.get('QTN-002')).toEqual({ status: 'Open', linkedPrds: [] })
  })

  it('an ordered root stays Ordered even once a later revision exists', () => {
    const enquiries = [
      { qtn_no: 'QTN-001', parent_qtn_no: null, revision_no: null },
      { qtn_no: 'QTN-002', parent_qtn_no: 'QTN-001', revision_no: 1 },
    ]
    const orders = [{ qtn_no: 'QTN-001', prd_no: 'PRD-010' }]
    const r = deriveEnquiryStatuses(enquiries, orders)
    expect(r.get('QTN-001')).toEqual({ status: 'Ordered', linkedPrds: ['PRD-010'] })
    expect(r.get('QTN-002')).toEqual({ status: 'Open', linkedPrds: [] })
  })

  it('the newest of several revisions is Open, earlier ones are Superseded', () => {
    const enquiries = [
      { qtn_no: 'QTN-001', parent_qtn_no: null, revision_no: null },
      { qtn_no: 'QTN-002', parent_qtn_no: 'QTN-001', revision_no: 1 },
      { qtn_no: 'QTN-003', parent_qtn_no: 'QTN-001', revision_no: 2 },
    ]
    const r = deriveEnquiryStatuses(enquiries, [])
    expect(r.get('QTN-001').status).toBe('Superseded')
    expect(r.get('QTN-002').status).toBe('Superseded')
    expect(r.get('QTN-003').status).toBe('Open')
  })
})
