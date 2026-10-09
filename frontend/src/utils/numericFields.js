// Blank form inputs arrive as "" -- Postgres rejects "" for numeric/integer
// columns ("invalid input syntax for type numeric"). Every save that sends a
// number field goes through these.

/** "" / null / undefined / whitespace / not a number -> null, otherwise a Number. */
export function toNumberOrNull(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Copy of `payload` with each key in `keys` passed through toNumberOrNull.
 * Keys listed in `zeroIfBlank` become 0 instead of null when blank (for
 * NOT NULL DEFAULT 0 columns). Other fields are left untouched. */
export function withNumericFields(payload, keys, { zeroIfBlank = [] } = {}) {
  const out = { ...payload }
  for (const key of keys) {
    if (!(key in out)) continue
    const n = toNumberOrNull(out[key])
    out[key] = n === null && zeroIfBlank.includes(key) ? 0 : n
  }
  return out
}
