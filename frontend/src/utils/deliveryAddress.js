// Customer delivery addresses (042) -- pure helpers: validation, default
// selection, display labels and lookups for PO lines / PRDs.

export const EMPTY_DELIVERY_ADDRESS = {
  label: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  country: '',
  gstin: '',
  is_default: false,
  is_active: true,
}

const TEXT_FIELDS = ['label', 'address', 'city', 'state', 'pincode', 'country', 'gstin']

export const PINCODE_MESSAGE = 'Pincode must be 6 digits.'
export const GSTIN_MESSAGE = 'Enter a valid 15-character GSTIN (e.g. 33AAAAA0000A1Z5).'
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/

const text = (v) => String(v ?? '').trim()

/** Trimmed payload for the DB: blanks -> null, pincode digits only,
 * GSTIN upper case, booleans kept. */
export function deliveryAddressPayload(form, customerId) {
  const out = { customer_id: customerId }
  for (const k of TEXT_FIELDS) out[k] = text(form[k]) || null
  if (out.pincode) out.pincode = out.pincode.replace(/\s/g, '')
  if (out.gstin) out.gstin = out.gstin.replace(/\s/g, '').toUpperCase()
  out.is_active = form.is_active !== false
  out.is_default = !!form.is_default && out.is_active
  return out
}

/** First problem as { field, error }, or null. `others` = the customer's
 * other addresses (for the duplicate-label check, case-insensitive). */
export function deliveryAddressProblem(form, others = []) {
  const label = text(form.label)
  if (!label) return { field: 'label', error: 'Label is required.' }
  if (label.length > 60) return { field: 'label', error: "Label can't be longer than 60 characters." }
  if (others.some((a) => text(a.label).toLowerCase() === label.toLowerCase())) {
    return { field: 'label', error: `${label} already exists for this customer.` }
  }
  const pin = text(form.pincode).replace(/\s/g, '')
  if (pin && !/^[0-9]{6}$/.test(pin)) return { field: 'pincode', error: PINCODE_MESSAGE }
  const gstin = text(form.gstin).replace(/\s/g, '').toUpperCase()
  if (gstin && !GSTIN_PATTERN.test(gstin)) return { field: 'gstin', error: GSTIN_MESSAGE }
  if (form.is_default && form.is_active === false) {
    return { field: 'is_default', error: 'An inactive address cannot be the default.' }
  }
  return null
}

export function addressesForCustomer(addresses, customerId, { activeOnly = false } = {}) {
  if (!customerId) return []
  return (addresses ?? []).filter((a) => a.customer_id === customerId && (!activeOnly || a.is_active))
}

/** Default active address id of the customer, else its only active one, else ''. */
export function defaultAddressId(addresses, customerId) {
  const active = addressesForCustomer(addresses, customerId, { activeOnly: true })
  const def = active.find((a) => a.is_default)
  if (def) return def.id
  return active.length === 1 ? active[0].id : ''
}

/** "Plant 1 - Hosur · Hosur" (city left out when blank or already the label). */
export function deliveryLabel(addr) {
  if (!addr) return ''
  const label = text(addr.label)
  const city = text(addr.city)
  if (!city || label.toLowerCase() === city.toLowerCase()) return label
  return `${label} · ${city}`
}

export function deliveryOptionLabel(addr) {
  const base = deliveryLabel(addr)
  return addr && addr.is_active === false ? `${base} (inactive)` : base
}

/** Full address block lines for FG Despatch / prints. */
export function deliveryAddressLines(addr) {
  if (!addr) return []
  const cityLine = [text(addr.city), text(addr.state)].filter(Boolean).join(', ')
  const cityPin = [cityLine, text(addr.pincode)].filter(Boolean).join(' - ')
  return [
    text(addr.label),
    text(addr.address),
    cityPin,
    text(addr.country),
    addr.gstin ? `GSTIN: ${text(addr.gstin)}` : '',
  ].filter(Boolean)
}

export function addressMap(addresses) {
  return new Map((addresses ?? []).map((a) => [a.id, a]))
}

/** Address object of a PO line (or a PRD row from listOrdersByPrd). */
export function deliveryForLine(line, byId) {
  if (!line || line.delivery_address_id == null || !byId) return null
  return byId.get(line.delivery_address_id) ?? null
}

export function deliveryForPrd(orders, prdNo, byId) {
  if (!prdNo) return null
  return deliveryForLine((orders ?? []).find((o) => o.prd_no === prdNo), byId)
}

/** Text for list cells / exports: '' when the line has no address. */
export function deliveryText(line, byId) {
  return deliveryLabel(deliveryForLine(line, byId))
}

/** Deliver To problem on a PO line: required when the customer has active
 * addresses; must be one of them (or the line's current one, kept on edit). */
export function deliverToProblem({ supported, addresses, customerId, deliveryAddressId, currentId = null }) {
  if (!supported) return null
  const active = addressesForCustomer(addresses, customerId, { activeOnly: true })
  if (!deliveryAddressId) {
    return active.length ? 'Deliver To is required -- pick one of the customer\'s delivery addresses.' : null
  }
  const id = Number(deliveryAddressId)
  const addr = (addresses ?? []).find((a) => a.id === id)
  if (!addr || addr.customer_id !== customerId) return 'Delivery address belongs to another customer.'
  if (!addr.is_active && id !== Number(currentId)) return 'Delivery address is inactive -- pick an active address.'
  return null
}

/** Deliver To dropdown options: the customer's active addresses, plus the
 * line's current one when it has since been deactivated (edit form). */
export function deliverToOptions(addresses, customerId, currentId = null) {
  const own = addressesForCustomer(addresses, customerId)
  return own
    .filter((a) => a.is_active || (currentId != null && currentId !== '' && a.id === Number(currentId)))
    .map((a) => ({ value: String(a.id), label: deliveryOptionLabel(a) }))
}

/** delivery_address_id for the DB: number or null. */
export function deliveryIdOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** " · Manufacturing · Plant 1 - Hosur · Hosur" for the running banner ('' when nothing). */
export function orderLineSuffix(part) {
  const bits = [String(part?.order_type ?? '').trim(), String(part?.deliver_to ?? '').trim()].filter(Boolean)
  return bits.length ? ` · ${bits.join(' · ')}` : ''
}
