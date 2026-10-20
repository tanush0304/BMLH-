// Display labels for stored status values. The DB keeps 'Closed Short'
// (migration 031) for a DC closed with pieces still out; the app SHOWS it as
// "Partially Received (Closed)" everywhere (client demo, 2026-10-17 / -20),
// so it never reads like an open partial DC. Only the text changes: the
// stored value, StatusPill colour, filters and KPIs keep 'Closed Short'.
const STATUS_DISPLAY = { 'Closed Short': 'Partially Received (Closed)' }

/** What the app shows for a stored status (unchanged when not mapped). */
export function displayStatus(status) {
  return STATUS_DISPLAY[status] ?? status
}

/** Lower-case text a list search matches a status on: stored value AND
 * label, so "closed", "short" and "partial" all find a Closed Short DC. */
export function statusSearchText(status) {
  if (!status) return ''
  return `${status} ${displayStatus(status)}`.toLowerCase()
}

/** Cell value for Excel / PDF: status columns export their display label. */
export function exportCellValue(column, row) {
  const value = row?.[column.key]
  return column.type === 'status' ? displayStatus(value) : value
}
