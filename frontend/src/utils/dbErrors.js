// Readable text for an error from a save. The database guards (031-036)
// raise clear messages -- a 23514 quantity refusal includes the max, e.g.
// "Quantity issued (60) is more than the current stock of TEST-RM01 (50)" --
// so those are shown exactly as the DB wrote them. Only the raw PostgreSQL /
// network / auth texts in FRIENDLY below are reworded (friendlyDbMessage).

const FRIENDLY = [
  [/^(?:PRD )?(PRD-\d+) has started \(\d+ row\(s\) in "production logs"\) and cannot be cancelled/,
    (m) => `${m[1]} can't be cancelled: production has already started on it. Only PRDs with no production entries can be cancelled.`],
  [/permission denied for (?:table|relation)\b/i, () => 'You do not have permission to make this change.'],
  [/duplicate key value violates unique constraint/i, () => 'This record already exists (a value that must be unique is already used).'],
  [/Failed to fetch|NetworkError/, () => "Can't reach the server -- check your connection and try again."],
  [/^Invalid login credentials$/i, () => 'Invalid username or password'],
]

/** The friendly wording for a known raw message; anything else unchanged. */
export function friendlyDbMessage(text) {
  if (typeof text !== 'string' || !text) return text
  for (const [re, to] of FRIENDLY) {
    const m = text.match(re)
    if (m) return to(m)
  }
  return text
}

export function dbErrorMessage(error, fallback = 'Could not save.') {
  const message = typeof error === 'string' ? error : error?.message ?? ''
  if (error?.code === '42501' && /^permission denied/i.test(message)) {
    return 'You do not have permission to make this change.'
  }
  return friendlyDbMessage(message) || fallback
}

/** True when the database refused a quantity over its limit (036 guards, 031/033 jobwork). */
export const isQtyLimitError = (error) => error?.code === '23514'
