// Employee "Personal details" (059): validation, payload, masking and the
// fixed error texts. PRIVACY: no message here ever contains a typed value.
import { validatePhone } from './numericFields'

export const EMPTY_PRIVATE = { phone_1: '', phone_2: '', address: '', aadhaar_last4: '' }
export const AADHAAR_MASK = 'XXXX XXXX'

/** Aadhaar input: digits only, at most 4. */
export const aadhaarInput = (raw) => String(raw ?? '').replace(/\D/g, '').slice(0, 4)

/** "XXXX XXXX 1234", or "" when none is stored. */
export function maskAadhaar(last4) {
  const d = String(last4 ?? '').trim()
  return d ? `${AADHAAR_MASK} ${d}` : ''
}

/** Saved row -> editable form. */
export function privateForm(row) {
  return {
    phone_1: row?.phone_1 ?? '',
    phone_2: row?.phone_2 ?? '',
    address: row?.address ?? '',
    aadhaar_last4: row?.aadhaar_last4 ?? '',
  }
}

/**
 * Checks before any DB call. Returns { error, field } (labels only, never
 * values) or { payload } with phones reduced to cleaned digits, blanks null.
 */
export function privatePayload(employeeId, form) {
  const out = { employee_id: employeeId }
  for (const [key, label] of [['phone_1', 'Phone 1'], ['phone_2', 'Phone 2']]) {
    const { value, error } = validatePhone(form[key], { label })
    if (error) return { error: `${label}: ${error}`, field: key } // PHONE_MESSAGE has no value in it
    out[key] = value || null
  }
  out.address = String(form.address ?? '').trim() || null
  const a = String(form.aadhaar_last4 ?? '').trim()
  if (a && !/^\d{4}$/.test(a)) return { error: 'Aadhaar: enter exactly the last 4 digits.', field: 'aadhaar_last4' }
  out.aadhaar_last4 = a || null
  return { payload: out }
}

/** Fixed text for a failed load / save, by error code only (never message / details). */
export function privateErrorText(error, action = 'save') {
  if (error?.code === '42501' || error?.rls) return 'You do not have permission to change personal details.'
  if (error?.code === '23514') return 'Check the personal details (Aadhaar last 4 must be 4 digits).'
  if (error?.code === '23503') return 'Save the employee first.'
  return action === 'load' ? 'Could not load personal details.' : 'Could not save personal details.'
}

export const canSeePrivate = (role) => role === 'supervisor' || role === 'admin'
