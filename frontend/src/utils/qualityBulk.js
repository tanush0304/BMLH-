// Quality Master: the one place that turns a target (part + applies-to +
// operation) and a parameter row into the save payload, plus the bulk-entry
// ("Add Multiple Parameters") checks. The single form and the bulk grid both
// use buildPayload, so they always send the same shape.
import { toNumberOrNull, validateNumber, NUMBER_RULES } from './numericFields'
import { isCategoryRow, isJobWorkRow, normCategory } from './qualityMatch'

export const BULK_START_ROWS = 5
export const EMPTY_BULK_ROW = {
  quality_parameter: '',
  check_type: 'Measured',
  standard: '',
  upper_tolerance: '',
  lower_tolerance: '',
  gauge_standard: '',
  gauge_ref: '',
  remarks: '',
}

const text = (v) => String(v ?? '').trim()

/** { byJobWork, byCategory } for a target, same rules as the single form. */
export function targetMode(target, { categoryOn, jobWorkOn }) {
  return {
    byJobWork: !!jobWorkOn && target.applies_to === 'jobwork',
    byCategory: !!categoryOn && target.applies_to === 'category',
  }
}

/** Job Work rows are always Gauge (056); otherwise the row's Check Type (048 only). */
export function rowIsGauge(row, target, flags) {
  const { byJobWork } = targetMode(target, flags)
  return byJobWork || (!!flags.checkTypeOn && row.check_type === 'Gauge')
}

/** The row's save payload (exactly what the single form has always sent). */
export function buildPayload(target, row, flags) {
  const { categoryOn, jobWorkOn, checkTypeOn, gaugeStandardOn } = flags
  const { byJobWork, byCategory } = targetMode(target, flags)
  const isGauge = rowIsGauge(row, target, flags)
  return {
    part_serial_number: target.part_serial_number,
    machine_id: byCategory || byJobWork ? null : target.machine_id,
    ...(categoryOn ? { machine_category: byCategory ? text(target.machine_category) : null } : {}),
    // 054 only: a Job Work row has no machine / category (DB check)
    ...(jobWorkOn ? { job_work_code: byJobWork ? target.job_work_code : null } : {}),
    type_of_operation: target.type_of_operation,
    quality_parameter: text(row.quality_parameter),
    standard: isGauge ? null : toNumberOrNull(row.standard),
    upper_tolerance: isGauge ? null : toNumberOrNull(row.upper_tolerance),
    lower_tolerance: isGauge ? null : toNumberOrNull(row.lower_tolerance),
    ...(checkTypeOn || byJobWork
      ? { check_type: isGauge ? 'Gauge' : 'Measured', gauge_ref: text(row.gauge_ref) || null } // Instrument, optional, both types
      : {}),
    // 053: text Standard for Gauge only (display, never used for the result)
    ...((checkTypeOn || byJobWork) && gaugeStandardOn
      ? { gauge_standard: isGauge ? text(row.gauge_standard) || null : null }
      : {}),
    expected_text_value: null,
    remarks: text(row.remarks) || null,
  }
}

/** Missing-target message, or null. */
export function targetProblem(target, flags) {
  const { byJobWork, byCategory } = targetMode(target, flags)
  const value = byJobWork ? target.job_work_code : byCategory ? text(target.machine_category) : target.machine_id
  if (!target.part_serial_number || !value || !target.type_of_operation) {
    return `Part Serial Number, ${byJobWork ? 'Job Work' : byCategory ? 'Machine Category' : 'Machine'} and Type of Operation are required.`
  }
  return null
}

/** Single-row value rules (same as the single form). { message, field } or null. */
export function rowProblem(row, isGauge) {
  if (!text(row.quality_parameter)) return { message: 'Quality Parameter is required.', field: 'quality_parameter' }
  if (isGauge) return null
  if (text(row.standard) === '') return { message: 'Standard is required.', field: 'standard' }
  const checks = [
    ['standard', { label: 'Standard', max: 1000000000 }],
    ['upper_tolerance', { label: 'Upper Tolerance', ...NUMBER_RULES.NON_NEGATIVE }],
    ['lower_tolerance', { label: 'Lower Tolerance', ...NUMBER_RULES.NON_NEGATIVE }],
  ]
  for (const [field, rule] of checks) {
    const message = validateNumber(row[field], rule)
    if (message) return { message, field }
  }
  return null
}

/** Nothing typed (Check Type alone has a default, so it doesn't count). */
export function isBlankRow(row) {
  return ['quality_parameter', 'standard', 'upper_tolerance', 'lower_tolerance', 'gauge_standard', 'gauge_ref', 'remarks']
    .every((k) => text(row[k]) === '')
}

/** Same part + operation + target (machine, category or job work) + parameter name already saved. */
export function duplicateParameter(records, form, byCategory, byJobWork = false) {
  const name = text(form.quality_parameter).toLowerCase()
  const clash = records.find((r) =>
    String(r.id) !== String(form.id || '') &&
    r.part_serial_number === form.part_serial_number &&
    (r.type_of_operation ?? '') === form.type_of_operation &&
    text(r.quality_parameter).toLowerCase() === name &&
    (byJobWork
      ? isJobWorkRow(r) && text(r.job_work_code) === text(form.job_work_code)
      : byCategory
        ? isCategoryRow(r) && normCategory(r.machine_category) === normCategory(form.machine_category)
        : !isJobWorkRow(r) && r.machine_id === form.machine_id))
  if (!clash) return null
  const where = byJobWork ? `Job Work ${form.job_work_code}` : byCategory ? `${text(form.machine_category)} (all)` : form.machine_id
  return `${text(clash.quality_parameter)} is already defined for ${form.part_serial_number} – ${form.type_of_operation} on ${where} -- edit it instead.`
}

/**
 * Every check for a bulk save. Returns
 *   { header: message|null, rows: { [index]: { message, field } }, empty: bool, count }
 * Blank rows are skipped (no error, not saved).
 */
export function bulkProblems(target, rows, records, flags) {
  const result = { header: targetProblem(target, flags), rows: {}, empty: false, count: 0 }
  const used = rows.map((row, i) => [row, i]).filter(([row]) => !isBlankRow(row))
  result.count = used.length
  if (used.length === 0) {
    result.empty = true
    return result
  }
  const { byJobWork, byCategory } = targetMode(target, flags)
  const names = new Map()
  for (const [row] of used) {
    const n = text(row.quality_parameter).toLowerCase()
    if (n) names.set(n, (names.get(n) ?? 0) + 1)
  }
  for (const [row, i] of used) {
    const own = rowProblem(row, rowIsGauge(row, target, flags))
    if (own) { result.rows[i] = own; continue }
    const n = text(row.quality_parameter).toLowerCase()
    if (names.get(n) > 1) {
      result.rows[i] = { message: `${text(row.quality_parameter)} is entered more than once in this grid.`, field: 'quality_parameter' }
      continue
    }
    if (!result.header) {
      const dup = duplicateParameter(records, { ...target, id: '', quality_parameter: row.quality_parameter }, byCategory, byJobWork)
      if (dup) result.rows[i] = { message: dup, field: 'quality_parameter' }
    }
  }
  return result
}

/** Payloads for the non-blank rows, in grid order. */
export function bulkPayloads(target, rows, flags) {
  return rows.filter((row) => !isBlankRow(row)).map((row) => buildPayload(target, row, flags))
}

/**
 * Grid index of the row a DB refusal is about, or null. The refusal names a
 * row only through its parameter name (e.g. a unique-key detail
 * "Key (..., quality_parameter)=(P1, ..., OD) already exists"), so: exactly
 * one non-blank row whose name appears as a whole word in message / details /
 * hint -> that row; none or several -> null (not guessed).
 */
export function rowFromDbError(error, rows) {
  const haystack = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase()
  if (!haystack) return null
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hits = []
  rows.forEach((row, i) => {
    if (isBlankRow(row)) return
    const name = text(row.quality_parameter).toLowerCase()
    if (name && new RegExp(`(^|[^a-z0-9])${esc(name)}($|[^a-z0-9])`).test(haystack)) hits.push(i)
  })
  return hits.length === 1 ? hits[0] : null
}

/** Saved rows of the same part + operation + target as `source` (Copy from). */
export function sourceRecords(records, source, flags) {
  const { byJobWork, byCategory } = targetMode(source, flags)
  return records.filter((r) =>
    r.part_serial_number === source.part_serial_number &&
    (r.type_of_operation ?? '') === source.type_of_operation &&
    (byJobWork
      ? isJobWorkRow(r) && text(r.job_work_code) === text(source.job_work_code)
      : byCategory
        ? isCategoryRow(r) && normCategory(r.machine_category) === normCategory(source.machine_category)
        : !isJobWorkRow(r) && !isCategoryRow(r) && r.machine_id === source.machine_id))
}

/** Saved records -> editable grid rows (ids dropped, numbers as text). */
export function copyRows(records) {
  const str = (v) => (v === null || v === undefined ? '' : String(v))
  return records.map((r) => ({
    quality_parameter: str(r.quality_parameter),
    check_type: r.check_type === 'Gauge' || isJobWorkRow(r) ? 'Gauge' : 'Measured',
    standard: str(r.standard),
    upper_tolerance: str(r.upper_tolerance),
    lower_tolerance: str(r.lower_tolerance),
    gauge_standard: str(r.gauge_standard),
    gauge_ref: str(r.gauge_ref),
    remarks: str(r.remarks),
  }))
}
