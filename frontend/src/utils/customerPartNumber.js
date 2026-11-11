// Customer part numbers (045) -- pure helpers: validation, payload, lookup
// by (customer, our part) and display text. A missing row is never an
// error: the display is "—".

export const EMPTY_CUSTOMER_PART = {
  part_serial_number: '',
  customer_part_number: '',
  customer_part_name: '',
  customer_drawing_ref: '',
  revision: '',
  is_active: true,
}

export const NO_VALUE = '—'

const TEXT_FIELDS = ['customer_part_name', 'customer_drawing_ref', 'revision']
const text = (v) => String(v ?? '').trim()
const same = (a, b) => text(a).toLowerCase() === text(b).toLowerCase()

/** Trimmed payload for the DB: blanks -> null (the part number is required). */
export function customerPartNumberPayload(form, customerId) {
  const out = {
    customer_id: customerId,
    part_serial_number: text(form.part_serial_number),
    customer_part_number: text(form.customer_part_number),
  }
  for (const k of TEXT_FIELDS) out[k] = text(form[k]) || null
  out.is_active = form.is_active !== false
  return out
}

/** First problem as { field, error }, or null. `others` = the customer's
 * other rows; only ACTIVE ones count for uniqueness (and only when this
 * one is saved active). */
export function customerPartNumberProblem(form, others = []) {
  const part = text(form.part_serial_number)
  if (!part) return { field: 'part_serial_number', error: 'Our Part is required.' }
  if (!text(form.customer_part_number)) {
    return { field: 'customer_part_number', error: 'Customer Part No is required.' }
  }
  if (form.is_active !== false && others.some((r) => r.is_active && same(r.part_serial_number, part))) {
    return {
      field: 'part_serial_number',
      error: `${part} already has a customer part number for this customer -- edit it instead.`,
    }
  }
  return null
}

export function partNumbersForCustomer(rows, customerId) {
  if (!customerId) return []
  return (rows ?? []).filter((r) => r.customer_id === customerId)
}

const keyOf = (customerId, part) => `${text(customerId)}|${text(part).toLowerCase()}`

/** Map "customer|part" -> row: the active row wins, else the latest inactive one. */
export function customerPartMap(rows) {
  const map = new Map()
  for (const r of rows ?? []) {
    const k = keyOf(r.customer_id, r.part_serial_number)
    const cur = map.get(k)
    if (!cur) map.set(k, r)
    else if (r.is_active && !cur.is_active) map.set(k, r)
    else if (r.is_active === cur.is_active && String(r.updated_at ?? '') > String(cur.updated_at ?? '')) map.set(k, r)
  }
  return map
}

/** The row for a customer + our part, or null (never throws). */
export function customerPartFor(map, customerId, part) {
  if (!map || !customerId || !part) return null
  return map.get(keyOf(customerId, part)) ?? null
}

/** Row for a PO line / PRD row (customer_id + part_serial_number). */
export function customerPartForLine(line, map) {
  return customerPartFor(map, line?.customer_id, line?.part_serial_number)
}

/** Customer part number text, "—" when none. */
export function customerPartNoText(row) {
  return text(row?.customer_part_number) || NO_VALUE
}

/** "D-45 Rev B" / "D-45" / "Rev B", "—" when none. */
export function customerDrawingText(row) {
  const dwg = text(row?.customer_drawing_ref)
  const rev = text(row?.revision)
  const s = [dwg, rev ? `Rev ${rev}` : ''].filter(Boolean).join(' ')
  return s || NO_VALUE
}

/** "CPN-123 · Dwg D-45 Rev B" (drawing part left out when blank), "—" when no row. */
export function customerPartLabel(row) {
  const cpn = text(row?.customer_part_number)
  if (!cpn) return NO_VALUE
  const dwg = customerDrawingText(row)
  return dwg === NO_VALUE ? cpn : `${cpn} · Dwg ${dwg}`
}

/** Display fields for a line: { customer_part_no, customer_drawing_ref } ("—" when blank). */
export function customerPartFields(line, map) {
  const row = customerPartForLine(line, map)
  return { customer_part_no: customerPartNoText(row), customer_drawing_ref: customerDrawingText(row) }
}
