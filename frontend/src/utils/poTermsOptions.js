import { mergeOptions } from '../components/SelectWithAddNew'

export const PAYMENT_TERMS = ['Advance', 'Against Delivery', '15 Days', '30 Days', '45 Days', '60 Days', '90 Days']
export const DELIVERY_TERMS = ['Ex-Works', 'FOR Destination', 'Door Delivery', 'Customer Pickup', 'Courier']

/** Built-in terms + every distinct value already saved on "customer po headers". */
export function paymentTermsOptions(poHeaders = []) {
  return mergeOptions(PAYMENT_TERMS, poHeaders.map((h) => h.payment_terms))
}

export function deliveryTermsOptions(poHeaders = []) {
  return mergeOptions(DELIVERY_TERMS, poHeaders.map((h) => h.delivery_terms))
}

/** Customer picked on the PO header: pre-fill Payment Terms from Customer
 * Master when that customer has one; otherwise keep whatever is there. */
export function withCustomer(poHeader, customerId, customers = []) {
  const customerTerms = customers.find((c) => c.customer_id === customerId)?.payment_terms
  return {
    ...poHeader,
    customer_id: customerId,
    payment_terms: customerTerms ? customerTerms : poHeader.payment_terms,
  }
}
