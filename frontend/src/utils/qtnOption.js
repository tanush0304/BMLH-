function formatQuotedPrice(price) {
  if (price === null || price === undefined || price === '') return ''
  return Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "QTN-004 (Rev 1) - HPV2 Rotor - 1,027.80" -- Rev suffix omitted for a
 * root enquiry (no revision_no). */
export function qtnOptionLabel(enquiry) {
  const rev = enquiry.revision_no ? ` (Rev ${enquiry.revision_no})` : ''
  const parts = [`${enquiry.qtn_no}${rev}`, enquiry.part_name, formatQuotedPrice(enquiry.quoted_price)].filter(
    Boolean
  )
  return parts.join(' - ')
}

/**
 * Enquiries selectable as an order line's optional "Quotation (QTN)" --
 * only this customer's enquiries, narrowed to the selected part if one's
 * already picked (otherwise every one of the customer's enquiries, part
 * undecided yet). Sorted newest QTN first ("default to newest revision",
 * since a revision always gets a higher qtn_no than what it revises) --
 * every match stays selectable, nothing is hidden.
 */
export function enquiryOptionsForOrder({ enquiries, customerId, partSerialNumber }) {
  if (!customerId) return []
  const matching = enquiries.filter(
    (e) => e.customer_id === customerId && (!partSerialNumber || e.part_serial_number === partSerialNumber)
  )
  return [...matching]
    .sort((a, b) => (a.qtn_no < b.qtn_no ? 1 : a.qtn_no > b.qtn_no ? -1 : 0))
    .map((e) => ({ value: e.qtn_no, label: qtnOptionLabel(e) }))
}
