// Full 12-digit Aadhaar (061): input cleaning, display format and the
// checks the app adds on top of the DB's "12 digits" check:
//   - first digit 2-9 (UIDAI never issues numbers starting with 0 or 1)
//   - Verhoeff check digit (the 12th digit)
// PRIVACY: messages never contain the number.

export const AADHAAR_INVALID = 'This is not a valid Aadhaar number.'
export const AADHAAR_LENGTH = 'Aadhaar must be exactly 12 digits.'

/** Input: digits only, at most 12 (spaces / dashes typed are dropped). */
export const aadhaarDigits = (raw) => String(raw ?? '').replace(/\D/g, '').slice(0, 12)

/** "1234 5678 9012" (groups of 4; partial input grouped as typed). */
export const formatAadhaar = (raw) => aadhaarDigits(raw).replace(/(\d{4})(?=\d)/g, '$1 ')

// Verhoeff tables (dihedral group D5)
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 8, 7, 6, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]

/** True when the whole digit string (check digit last) passes Verhoeff. */
export function verhoeffValid(digits) {
  const s = String(digits ?? '')
  if (!/^\d+$/.test(s)) return false
  let c = 0
  const rev = s.split('').reverse()
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][Number(rev[i])]]
  return c === 0
}

/** The check digit to append to `digits` (used by tests to build valid numbers). */
export function verhoeffCheckDigit(digits) {
  let c = 0
  const rev = String(digits).split('').reverse()
  for (let i = 0; i < rev.length; i++) c = D[c][P[(i + 1) % 8][Number(rev[i])]]
  return INV[c]
}

/** Message or null. Blank = no Aadhaar (allowed). Never includes the number. */
export function aadhaarProblem(raw) {
  const d = String(raw ?? '').replace(/\s/g, '')
  if (!d) return null
  if (!/^\d{12}$/.test(d)) return AADHAAR_LENGTH
  if (!/^[2-9]/.test(d) || !verhoeffValid(d)) return AADHAAR_INVALID
  return null
}
