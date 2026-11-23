// Cycle Time Master: the one place that builds a route-step payload (single
// form + "Add Multiple Stages"), plus the bulk-entry checks. The single form
// keeps its own validation order and messages; duplicates and machine
// capability are checked in bulk entry only (user decision 2026-11-23).
import { toNumberOrNull, validateNumber, NUMBER_RULES } from './numericFields'

export const BULK_START_ROWS = 5
export const STEP_TYPES = ['Internal', 'Outsourced', 'Manual']
export const EMPTY_STAGE_ROW = { seq: '', operation: '', type: '', machine_id: '', job_work_code: '', cycle_time_min: '' }

const text = (v) => String(v ?? '').trim()
// same operation-name match as Data Entry's machine choice (machineEligibility.js)
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** The step's save payload (exactly what the single form has always sent). */
export function buildCycleTimePayload(partSerialNumber, row) {
  return {
    part_serial_number: partSerialNumber,
    operation: text(row.operation),
    seq: Number(row.seq),
    type: row.type,
    machine_id: row.type === 'Internal' ? row.machine_id : null,
    job_work_code: row.type === 'Outsourced' ? row.job_work_code : null,
    cycle_time_min: toNumberOrNull(row.cycle_time_min),
  }
}

/** Type change: clear the machine / job work that no longer applies (single form rule). */
export function withType(row, type) {
  return {
    ...row,
    type,
    machine_id: type === 'Internal' ? row.machine_id : '',
    job_work_code: type === 'Outsourced' ? row.job_work_code : '',
  }
}

/** Single-form rules for one row. { message, field } or null. */
export function rowProblem(row) {
  if (!text(row.operation) || !text(row.seq) || !row.type) {
    const field = !text(row.seq) ? 'seq' : !text(row.operation) ? 'operation' : 'type'
    return { message: 'Operation, Stage and Type are required.', field }
  }
  const seqError = validateNumber(row.seq, { label: 'Stage', integer: true, min: 0, minExclusive: true, max: 999 })
  if (seqError) return { message: seqError, field: 'seq' }
  const ctError = validateNumber(row.cycle_time_min, { label: 'Cycle Time (min)', ...NUMBER_RULES.POSITIVE })
  if (ctError) return { message: ctError, field: 'cycle_time_min' }
  if (row.type === 'Internal' && !row.machine_id) return { message: 'Machine is required for an Internal step.', field: 'machine_id' }
  if (row.type === 'Outsourced' && !row.job_work_code) return { message: 'Job Work Type is required for an Outsourced step.', field: 'job_work_code' }
  return null
}

/** Nothing typed (Type alone counts as typed -- it is not defaulted). */
export function isBlankRow(row) {
  return ['seq', 'operation', 'type', 'machine_id', 'job_work_code', 'cycle_time_min'].every((k) => text(row[k]) === '')
}

/** Duplicate key: stage + target (machine for Internal, job work for Outsourced, none for Manual). */
function stepKey(type, seq, machineId, jobWorkCode) {
  const target = type === 'Internal' ? `M:${text(machineId)}` : type === 'Outsourced' ? `J:${text(jobWorkCode)}` : 'manual'
  return `${Number(seq)}|${target}`
}
const targetText = (row) => (row.type === 'Internal' ? ` on ${row.machine_id}` : row.type === 'Outsourced' ? ` (Job Work ${row.job_work_code})` : ' (Manual)')

/**
 * Machine capability (Machine Operations): block only when the machine HAS
 * operations defined and this one isn't among them; machines with none are
 * not checked. Message or null.
 */
export function capabilityProblem(row, machineOps = []) {
  if (row.type !== 'Internal' || !row.machine_id) return null
  const ops = machineOps.filter((r) => r.machine_id === row.machine_id)
  if (ops.length === 0) return null
  if (ops.some((r) => norm(r.operation) === norm(row.operation))) return null
  return `${row.machine_id} is not set up for '${text(row.operation)}' in Machine Master (Machine Operations).`
}

/**
 * Every check for a bulk save. Returns
 *   { header: message|null, rows: { [index]: { message, field } }, empty, count }
 * Blank rows are skipped. existing = saved Cycle Time rows (any part).
 */
export function bulkProblems(partSerialNumber, rows, existing = [], machineOps = []) {
  const result = { header: partSerialNumber ? null : 'Select the Part Serial Number.', rows: {}, empty: false, count: 0 }
  const used = rows.map((row, i) => [row, i]).filter(([row]) => !isBlankRow(row))
  result.count = used.length
  if (!used.length) {
    result.empty = true
    return result
  }
  const keyed = new Map()
  for (const [row, i] of used) {
    if (rowProblem(row)) continue
    const k = stepKey(row.type, row.seq, row.machine_id, row.job_work_code)
    keyed.set(k, [...(keyed.get(k) ?? []), i])
  }
  const saved = new Set(existing
    .filter((r) => r.part_serial_number === partSerialNumber)
    .map((r) => stepKey(r.type, r.seq, r.machine_id, r.job_work_code)))
  for (const [row, i] of used) {
    const own = rowProblem(row)
    if (own) { result.rows[i] = own; continue }
    const cap = capabilityProblem(row, machineOps)
    if (cap) { result.rows[i] = { message: cap, field: 'machine_id' }; continue }
    const k = stepKey(row.type, row.seq, row.machine_id, row.job_work_code)
    if (keyed.get(k).length > 1) {
      result.rows[i] = { message: `Stage ${Number(row.seq)}${targetText(row)} is entered more than once in this grid.`, field: 'seq' }
      continue
    }
    if (partSerialNumber && saved.has(k)) {
      result.rows[i] = { message: `Stage ${Number(row.seq)}${targetText(row)} already exists for ${partSerialNumber} -- edit it instead.`, field: 'seq' }
    }
  }
  return result
}

/** Payloads for the non-blank rows, in grid order. */
export function bulkPayloads(partSerialNumber, rows) {
  return rows.filter((row) => !isBlankRow(row)).map((row) => buildCycleTimePayload(partSerialNumber, row))
}

/**
 * Grid index of the row a DB refusal is about, or null (never guessed):
 * exactly one non-blank row whose operation name (whole word) or
 * "Stage N" / "seq N" appears in message / details / hint.
 */
export function rowFromDbError(error, rows) {
  const haystack = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase()
  if (!haystack) return null
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const word = (s) => new RegExp(`(^|[^a-z0-9])${esc(s)}($|[^a-z0-9])`).test(haystack)
  const hits = []
  rows.forEach((row, i) => {
    if (isBlankRow(row)) return
    const op = norm(row.operation)
    const seq = text(row.seq)
    if ((op && word(op)) || (seq && (word(`stage ${seq}`) || word(`seq ${seq}`)))) hits.push(i)
  })
  return hits.length === 1 ? hits[0] : null
}
