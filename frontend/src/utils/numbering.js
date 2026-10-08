/**
 * Next "<PREFIX>-NNN" number: highest numeric suffix among values that match
 * the shape + 1, zero-padded to at least 3 digits. Compared as numbers, not
 * text, so PRE-999 -> PRE-1000 and PRE-1000 beats PRE-999. Values that don't
 * match (e.g. pilot "PRD-HPV-A") are ignored.
 */
export function nextSequenceNo(prefix, values) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  const maxNum = values.reduce((max, v) => {
    const match = pattern.exec(v ?? '')
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
}
