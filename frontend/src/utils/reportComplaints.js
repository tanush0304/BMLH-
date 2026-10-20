// Customer Complaint report (client demo, 2026-10-17). Pure helpers over
// "customer complaints" rows (027); no migration.
import { SEVERITY_OPTIONS } from './customerComplaints'

const NOT_SET = 'Not set'

/** Grouping key for the free-text defect (027 `defect_problem`, typed via
 * "+ Add new"): trimmed, inner spaces collapsed, lower case -- so "Burr",
 * " burr" and "BURR " count as one. null for blank. Swap this (and
 * defectLabels) for a defect-master lookup if one is added later. */
export function normalizeDefect(text) {
  const key = String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return key || null
}

/** Display label per defect key: the most common tidy spelling seen (a tie
 * goes to the spelling seen first), e.g. { burr: 'Burr' }. */
export function defectLabels(rows) {
  const counts = new Map()
  for (const r of rows) {
    const key = normalizeDefect(r.defect_problem)
    if (!key) continue
    const spelling = String(r.defect_problem).trim().replace(/\s+/g, ' ')
    const m = counts.get(key) ?? new Map()
    m.set(spelling, (m.get(spelling) ?? 0) + 1)
    counts.set(key, m)
  }
  const out = {}
  for (const [key, m] of counts) {
    out[key] = [...m].sort((a, b) => b[1] - a[1])[0][0] // stable: ties keep first-seen order
  }
  return out
}

/** Complaints in the period (complaint_date from..to, inclusive) matching the
 * Customer / Severity filters (blank = all). */
export function filterComplaints(rows, { from, to, customer, severity } = {}) {
  return rows.filter(
    (r) =>
      (!from || r.complaint_date >= from) &&
      (!to || r.complaint_date <= to) &&
      (!customer || r.customer_id === customer) &&
      (!severity || r.severity === severity)
  )
}

/** Total / Open / Closed: Closed = status 'Closed' only; Open = every other
 * status (Open, Under Investigation, Action Pending, Resolved), so
 * total = open + closed always. */
export function complaintKpis(rows) {
  const closed = rows.filter((r) => r.status === 'Closed').length
  return { total: rows.length, open: rows.length - closed, closed }
}

/** Count per label, largest first (ties alphabetical). */
function countBy(rows, labelFn) {
  const m = new Map()
  for (const r of rows) {
    const label = labelFn(r)
    m.set(label, (m.get(label) ?? 0) + 1)
  }
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

/** Complaints per customer; `customerName(id)` gives the display name. */
export function complaintsByCustomer(rows, customerName = (id) => id) {
  return countBy(rows, (r) => customerName(r.customer_id) || r.customer_id || NOT_SET)
}

/** Complaints per defect, case / spacing variants merged (normalizeDefect). */
export function complaintsByDefect(rows) {
  const labels = defectLabels(rows)
  return countBy(rows, (r) => labels[normalizeDefect(r.defect_problem)] ?? NOT_SET)
}

/** Complaints per part (Part Serial Number). */
export function complaintsByPart(rows) {
  return countBy(rows, (r) => r.part_serial_number || NOT_SET)
}

/** Complaints per severity in Critical / Major / Minor order (all three
 * always shown), then 'Not set' only when some have none. */
export function complaintsBySeverity(rows) {
  const out = SEVERITY_OPTIONS.map((s) => ({ label: s, value: rows.filter((r) => r.severity === s).length }))
  const none = rows.filter((r) => !SEVERITY_OPTIONS.includes(r.severity)).length
  return none ? [...out, { label: NOT_SET, value: none }] : out
}
