// Pure logic for SearchableSelect (components/SearchableSelect.jsx), kept
// outside the component so filtering and keyboard handling are testable
// without a DOM.

/** Same option shapes SelectInput accepts: plain values or { value, label }.
 * Values are stringified, as a native <select> would report them. */
export function normalizeOptions(options = []) {
  return options.map((opt) =>
    typeof opt === 'object' && opt !== null
      ? { value: String(opt.value), label: String(opt.label ?? opt.value) }
      : { value: String(opt), label: String(opt) }
  )
}

/** Case-insensitive "contains" match on both label and value, so typing a
 * code ("011") or part of a name ("bhola") both find
 * "BMLH-011 – Bholanath". Blank query returns everything. */
export function filterOptions(options, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
}

/**
 * Keyboard handling for the open/closed list.
 * state: { open, highlight } -- highlight is an index into `filtered`.
 * Returns { open, highlight, pick?, preventDefault? }:
 *   pick           -- the option to select (Enter on a highlighted row)
 *   preventDefault -- the key was consumed (Tab is never consumed, so focus
 *                     moves on normally)
 */
export function keyAction(key, state, filtered) {
  const count = filtered.length
  const { open, highlight } = state
  switch (key) {
    case 'ArrowDown':
      if (!open) return { open: true, highlight: count ? 0 : -1, preventDefault: true }
      return { open, highlight: count ? Math.min(highlight + 1, count - 1) : -1, preventDefault: true }
    case 'ArrowUp':
      if (!open) return { open: true, highlight: count ? count - 1 : -1, preventDefault: true }
      return { open, highlight: count ? Math.max(highlight - 1, 0) : -1, preventDefault: true }
    case 'Enter':
      if (!open) return { open: true, highlight: count ? 0 : -1, preventDefault: true }
      if (highlight >= 0 && highlight < count) return { open: false, highlight: -1, pick: filtered[highlight], preventDefault: true }
      return { open, highlight, preventDefault: true }
    case 'Escape':
      return { open: false, highlight: -1, preventDefault: open }
    case 'Tab':
      return { open: false, highlight: -1 }
    default:
      return { open, highlight }
  }
}
