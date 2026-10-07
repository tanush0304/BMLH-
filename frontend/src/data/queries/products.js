import { supabase } from '../../lib/supabaseClient'

const TABLE = 'products master'

export async function listProducts() {
  const { data, error } = await supabase.from(TABLE).select('*').order('part_serial_number')
  if (error) throw error
  return data
}

export async function createProduct(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateProduct(partSerialNumber, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('part_serial_number', partSerialNumber)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProduct(partSerialNumber) {
  const { error } = await supabase.from(TABLE).delete().eq('part_serial_number', partSerialNumber)
  if (error) throw error
}

/** Case/space/hyphen-insensitive key for comparing part codes -- "hpv2",
 * "HPV 2" and "HPV2" must all be treated as the same part. */
export function normalizePartCode(code) {
  return (code ?? '').trim().toLowerCase().replace(/[\s-]+/g, '')
}

/**
 * Resolves a typed-new part at save time, shared by every screen that lets
 * someone type a brand-new part number inline (New Customer Order's line
 * items, Customer Enquiry's Part Serial Number) instead of picking an
 * existing one. Typing a new value doesn't persist anything until save --
 * only then does the real Products Master row get created.
 *
 * Returns one of three outcomes:
 *   - { status: 'existing', partSerialNumber, knownProducts } -- not a new
 *     part, or the typed code is byte-for-byte already in knownProducts.
 *   - { status: 'near-match', match: { part_serial_number, part_name } } --
 *     the typed code normalizes the same as an existing part (different
 *     case/spacing/hyphens) but isn't identical text. Nothing is created;
 *     the caller must resolve the ambiguity (see resolveProductWithConfirmation
 *     below) before calling again.
 *   - { status: 'created', partSerialNumber, knownProducts } -- a brand-new
 *     Products Master row was actually inserted (code/name/drawing number
 *     trimmed before saving). Only reached when there's no near-match, or
 *     the caller explicitly passed `confirmCreateNew: true` to proceed
 *     despite one.
 *
 * knownProducts lets the caller track newly-created parts across multiple
 * sequential resolves in one save (so a second reference to the same
 * brand-new part, e.g. two line items on the same PO, doesn't try to
 * insert it twice) -- pass the updated `knownProducts` back in next call.
 */
export async function resolveOrCreateProduct({
  isNewPart,
  partSerialNumber,
  newPartCode,
  partName,
  drawingNumber,
  knownProducts,
  confirmCreateNew = false,
}) {
  if (!isNewPart) return { status: 'existing', partSerialNumber, knownProducts }

  const trimmedCode = (newPartCode ?? '').trim()
  const exact = knownProducts.find((p) => p.part_serial_number === trimmedCode)
  if (exact) return { status: 'existing', partSerialNumber: trimmedCode, knownProducts }

  if (!confirmCreateNew) {
    const normalized = normalizePartCode(trimmedCode)
    const near = knownProducts.find((p) => normalizePartCode(p.part_serial_number) === normalized)
    if (near) {
      return { status: 'near-match', match: { part_serial_number: near.part_serial_number, part_name: near.part_name } }
    }
  }

  const created = await createProduct({
    part_serial_number: trimmedCode,
    part_name: (partName ?? '').trim(),
    part_drawing_reference_number: drawingNumber ? drawingNumber.trim() : null,
  })
  return { status: 'created', partSerialNumber: created.part_serial_number, knownProducts: [...knownProducts, created] }
}

/**
 * Wraps resolveOrCreateProduct with the "did you mean this?" confirmation
 * step: a near-match never silently creates a duplicate -- it asks (via
 * the injectable `confirmFn`, so this stays unit-testable without a real
 * window.confirm) whether the existing part was meant instead. Declining
 * proceeds to actually create the new part (confirmCreateNew: true).
 */
export async function resolveProductWithConfirmation(params, confirmFn = (msg) => window.confirm(msg)) {
  const resolved = await resolveOrCreateProduct(params)
  if (resolved.status !== 'near-match') return resolved

  const useExisting = confirmFn(
    `A similar part already exists: ${resolved.match.part_serial_number}` +
      (resolved.match.part_name ? ` (${resolved.match.part_name})` : '') +
      '. Did you mean this one?'
  )
  if (useExisting) {
    return { status: 'existing', partSerialNumber: resolved.match.part_serial_number, knownProducts: params.knownProducts }
  }
  return resolveOrCreateProduct({ ...params, confirmCreateNew: true })
}
