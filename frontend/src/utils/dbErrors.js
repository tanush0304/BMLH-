// Readable text for an error from a save. The database guards (031-036)
// raise clear messages -- a 23514 quantity refusal includes the max, e.g.
// "Quantity issued (60) is more than the current stock of TEST-RM01 (50)" --
// so those are shown exactly as the DB wrote them. Only a bare PostgreSQL
// "permission denied for ..." (a missing grant / RLS) is translated.
export function dbErrorMessage(error, fallback = 'Could not save.') {
  const message = typeof error === 'string' ? error : error?.message ?? ''
  if (error?.code === '42501' && /^permission denied/i.test(message)) {
    return 'You do not have permission to make this change.'
  }
  return message || fallback
}

/** True when the database refused a quantity over its limit (036 guards, 031/033 jobwork). */
export const isQtyLimitError = (error) => error?.code === '23514'
