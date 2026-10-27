// Shared checks for master screens: trim, required-after-trim, code length
// and case-insensitive duplicate codes. Codes keep the case the user typed.

import { validatePhone, validateNumber, NUMBER_RULES } from './numericFields'

export const MAX_CODE_LENGTH = 30

/** Copy of `form` with every string value trimmed (or only `keys` when given). */
export function trimTextFields(form, keys) {
  const out = { ...form }
  for (const k of keys ?? Object.keys(out)) {
    if (typeof out[k] === 'string') out[k] = out[k].trim()
  }
  return out
}

/** First required field (from a [{ key, label, required }] list) that is blank after trimming. */
export function requiredMissing(fields, form) {
  return fields.find((f) => f.required && String(form[f.key] ?? '').trim() === '') ?? null
}

/** Message when a code is longer than MAX_CODE_LENGTH, else null. */
export function codeTooLong(code, label = 'Code', max = MAX_CODE_LENGTH) {
  return String(code ?? '').trim().length > max ? `${label} can't be longer than ${max} characters.` : null
}

const norm = (v) => String(v ?? '').trim().toLowerCase()

/** "CUST-001 already exists" when `code` matches one of `existingCodes`
 * ignoring case and surrounding spaces; null otherwise. */
export function duplicateCodeError(code, existingCodes) {
  const n = norm(code)
  if (!n) return null
  const hit = existingCodes.find((c) => norm(c) === n)
  return hit !== undefined ? `${String(hit).trim()} already exists.` : null
}

/**
 * One-stop check for a hand-written master's Save:
 *   form, mode ('new' | 'edit'), records (loaded list),
 *   codeKey / codeLabel  -- the typed primary code (length + duplicate, new only),
 *   required: [{ key, label }], requiredMessage (shown when any is blank),
 *   numbers: [{ key, label, rule }], mobiles: [{ key, label, required }].
 * Returns { error } or { cleaned } (trimmed; phones reduced to cleaned digits).
 */
export function checkMaster({ form, mode, records = [], codeKey, codeLabel = 'Code', required = [], requiredMessage, numbers = [], mobiles = [] }) {
  const cleaned = trimTextFields(form)
  const missing = required.find((f) => String(cleaned[f.key] ?? '') === '')
  if (missing) return { error: requiredMessage ?? `${missing.label} is required.` }
  if (codeKey && mode === 'new') {
    const err = codeTooLong(cleaned[codeKey], codeLabel) ?? duplicateCodeError(cleaned[codeKey], records.map((r) => r[codeKey]))
    if (err) return { error: err }
  }
  for (const { key, label, rule } of numbers) {
    const error = validateNumber(cleaned[key], { label, ...rule })
    if (error) return { error }
  }
  for (const { key, label, required: req } of mobiles) {
    const { value, error } = validatePhone(cleaned[key], { label, required: req })
    if (error) return { error }
    cleaned[key] = value
  }
  return { cleaned }
}

/** Production Batch Master save check: part required, one batch per part
 * (new only), batch qty a whole number > 0. Message or null. */
export function productionBatchError(form, mode, records = []) {
  const part = String(form.part_serial_number ?? '').trim()
  if (!part) return 'Part Serial Number is required.'
  if (mode === 'new' && records.some((r) => norm(r.part_serial_number) === norm(part))) {
    return `${part} already has a batch size -- edit it instead.`
  }
  return validateNumber(form.production_batch_quantity, { label: 'Production Batch Quantity', ...NUMBER_RULES.QTY })
}
