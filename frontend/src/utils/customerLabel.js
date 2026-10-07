// Same "Name (ID)" display pattern as utils/machineLabel.js. Display only
// -- the saved value is always customer_id, never the label. Some real
// customer rows (loaded straight from BMLH's source data) have no
// customer_name yet, so this falls back to the bare ID rather than ever
// rendering "undefined".
export function customerOptionLabel(customer) {
  return customer.customer_name ? `${customer.customer_name} (${customer.customer_id})` : customer.customer_id
}

function sortKey(customer) {
  return customer.customer_name || customer.customer_id || ''
}

/** Customers as {value, label} dropdown options, sorted by display name
 * (falling back to ID when a name is missing) rather than by ID. */
export function customerDropdownOptions(customers) {
  return [...customers]
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .map((c) => ({ value: c.customer_id, label: customerOptionLabel(c) }))
}
