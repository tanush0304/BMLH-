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
