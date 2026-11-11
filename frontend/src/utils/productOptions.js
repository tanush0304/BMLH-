/** Dropdown options for parts: value = part_serial_number (unchanged),
 * label = "serial – name" so the searchable dropdown matches on either. */
export function productOptions(products) {
  return products.map((p) => ({
    value: p.part_serial_number,
    label: p.part_name ? `${p.part_serial_number} – ${p.part_name}` : p.part_serial_number,
  }))
}

const blank = (v) => v == null || String(v).trim() === ''

/** 045: parts offered for a customer = that customer's parts + parts with no
 * customer set + `currentPart` (always kept, so an existing line / enquiry
 * never loses its part even when it belongs to another customer). No
 * customer picked, or `enabled` false (before 045) -> every part. */
export function partsForCustomer(products, customerId, currentPart = '', { enabled = true } = {}) {
  const list = products ?? []
  if (!enabled || blank(customerId)) return list
  return list.filter(
    (p) => blank(p.customer_id) || p.customer_id === customerId || (!blank(currentPart) && p.part_serial_number === currentPart),
  )
}

/** True when `part` belongs to ANOTHER customer than `customerId` (unassigned
 * parts and unknown parts never conflict). Used to clear a new line's part
 * when its customer changes. */
export function partBelongsToOtherCustomer(products, part, customerId, { enabled = true } = {}) {
  if (!enabled || blank(part) || blank(customerId)) return false
  const p = (products ?? []).find((x) => x.part_serial_number === part)
  return !!p && !blank(p.customer_id) && p.customer_id !== customerId
}
