// Blank form inputs arrive as "" -- Postgres rejects "" for numeric, boolean
// and date columns ("invalid input syntax for type numeric/boolean/date").
// Every save that sends one of those field types goes through these.

function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/** "" / null / undefined / whitespace / not a number -> null, otherwise a Number. */
export function toNumberOrNull(value) {
  if (isBlank(value)) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** true / "true" -> true, false / "false" -> false, anything else (incl. blank) -> null.
 * Booleans come back from a <select> as the strings "true" / "false". */
export function toBooleanOrNull(value) {
  if (value === true || value === false) return value
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'true') return true
    if (v === 'false') return false
  }
  return null
}

/** Blank -> null, otherwise the trimmed date string (YYYY-MM-DD from <input type="date">). */
export function toDateOrNull(value) {
  if (isBlank(value)) return null
  return typeof value === 'string' ? value.trim() : value
}

/** Blank -> null, otherwise the trimmed string (for optional text columns). */
export function toTextOrNull(value) {
  if (isBlank(value)) return null
  return typeof value === 'string' ? value.trim() : value
}

/** Copy of `payload` with typed keys converted: `numeric` via toNumberOrNull
 * (keys in `zeroIfBlank` become 0 instead of null, for NOT NULL DEFAULT 0
 * columns), `boolean` via toBooleanOrNull, `date` via toDateOrNull, `text`
 * via toTextOrNull. Keys not present in the payload and all other fields are
 * left untouched. */
export function withTypedFields(payload, { numeric = [], boolean = [], date = [], text = [], zeroIfBlank = [] } = {}) {
  const out = { ...payload }
  for (const key of numeric) {
    if (!(key in out)) continue
    const n = toNumberOrNull(out[key])
    out[key] = n === null && zeroIfBlank.includes(key) ? 0 : n
  }
  for (const key of boolean) if (key in out) out[key] = toBooleanOrNull(out[key])
  for (const key of date) if (key in out) out[key] = toDateOrNull(out[key])
  for (const key of text) if (key in out) out[key] = toTextOrNull(out[key])
  return out
}

/** Numeric-only shorthand for withTypedFields. */
export function withNumericFields(payload, keys, { zeroIfBlank = [] } = {}) {
  return withTypedFields(payload, { numeric: keys, zeroIfBlank })
}

/** A form-config field is boolean when typed 'boolean', or a select whose
 * only options are "true" / "false". */
export function isBooleanField(field) {
  if (field.type === 'boolean') return true
  if (field.type !== 'select' || !Array.isArray(field.options)) return false
  const opts = field.options.map((o) => String(typeof o === 'object' ? o.value : o)).sort()
  return opts.length === 2 && opts[0] === 'false' && opts[1] === 'true'
}

/** withTypedFields options derived from a form config's field list
 * ({ key, type, options }): number -> numeric, date -> date, boolean -> boolean. */
export function typedKeysFromFields(fields) {
  return {
    numeric: fields.filter((f) => f.type === 'number').map((f) => f.key),
    date: fields.filter((f) => f.type === 'date').map((f) => f.key),
    boolean: fields.filter(isBooleanField).map((f) => f.key),
  }
}

/** Options for a true/false <select>: shows Yes / No, saves "true" / "false"
 * (converted to a real boolean by toBooleanOrNull on save). */
export const YES_NO_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

// ---------------------------------------------------------------------------
// Input validation (checked before any DB call). Each returns a readable
// message, or null when the value is fine.

/** Standard limits. Quantities, hours and lead time must be > 0. */
export const NUMBER_RULES = {
  QTY: { integer: true, min: 0, minExclusive: true, max: 1000000 },
  SHIFT_HOURS: { min: 0, minExclusive: true, max: 24 },
  SETTING_TIME: { integer: true, min: 0, max: 1440 },
  LEAD_TIME: { integer: true, min: 0, minExclusive: true, max: 365 },
  NON_NEGATIVE: { min: 0, max: 1000000000 },
  POSITIVE: { min: 0, minExclusive: true, max: 1000000000 },
}

const indian = (n) => Number(n).toLocaleString('en-IN')

/**
 * Validate a number typed into a form. Blank passes unless `required`.
 * "1,000" and "abc" are refused (not silently parsed); surrounding spaces are fine.
 */
export function validateNumber(value, { label = 'Value', required = false, integer = false, min, minExclusive = false, max } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : null
  const text = String(value).trim()
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return `${label} must be a number (digits only, no commas).`
  const n = Number(text)
  if (!Number.isFinite(n)) return `${label} must be a number.`
  if (integer && !Number.isInteger(n)) return `${label} must be a whole number.`
  if (min !== undefined) {
    if (minExclusive && n <= min) return `${label} must be greater than ${indian(min)}.`
    if (!minExclusive && n < min) return `${label} can't be less than ${indian(min)}.`
  }
  if (max !== undefined && n > max) return `${label} can't be more than ${indian(max)}.`
  return null
}

export const PHONE_MESSAGE = 'Enter a valid 10-digit mobile or a landline with STD code (e.g. 080-23456789).'

/**
 * Indian phone number: either a mobile (10 digits starting 6-9, optional
 * "+91" / "91" / leading "0") or a landline with STD code (starts with 0,
 * 10-11 digits). Spaces, dashes and brackets are ignored.
 * Returns { value, error }: value is the cleaned digits -- mobile as 10
 * digits, landline with its leading 0 ('' when blank).
 */
export function validatePhone(raw, { label = 'Mobile Number', required = false } = {}) {
  if (isBlank(raw)) return { value: '', error: required ? `${label} is required.` : null }
  const s = String(raw).trim().replace(/[\s\-()]/g, '')
  // "080-2345 6789" / "(0821) 234567": a separated 3-5 digit STD group means
  // landline, even when the digits would also read as 0 + a mobile.
  const stdGroup = /^\(?0\d{2,4}(?:\)|[\s-])/.test(String(raw).trim())
  if (stdGroup && /^0\d{9,10}$/.test(s)) return { value: s, error: null }
  const mobile = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(s)
  if (mobile) return { value: mobile[1], error: null }
  if (/^0\d{9,10}$/.test(s)) return { value: s, error: null }
  return { value: s, error: PHONE_MESSAGE }
}
