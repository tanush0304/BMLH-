import { describe, it, expect } from 'vitest'
import { paymentTermsOptions, deliveryTermsOptions, withCustomer, PAYMENT_TERMS, DELIVERY_TERMS } from './poTermsOptions'

describe('PO terms options', () => {
  it('adds distinct saved values after the built-ins', () => {
    const headers = [{ payment_terms: '120 Days', delivery_terms: 'Ex-Works' }, { payment_terms: '30 Days', delivery_terms: 'Rail' }, { payment_terms: null }]
    expect(paymentTermsOptions(headers)).toEqual([...PAYMENT_TERMS, '120 Days'])
    expect(deliveryTermsOptions(headers)).toEqual([...DELIVERY_TERMS, 'Rail'])
  })
})

describe('withCustomer', () => {
  const customers = [{ customer_id: 'C1', payment_terms: '45 Days' }, { customer_id: 'C2', payment_terms: null }]
  it("pre-fills Payment Terms from the customer's master record", () => {
    expect(withCustomer({ customer_id: '', payment_terms: '' }, 'C1', customers)).toEqual({ customer_id: 'C1', payment_terms: '45 Days' })
  })
  it('keeps the current value when the customer has none', () => {
    expect(withCustomer({ customer_id: 'C1', payment_terms: 'Advance' }, 'C2', customers)).toEqual({ customer_id: 'C2', payment_terms: 'Advance' })
  })
})
