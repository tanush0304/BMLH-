// Quality Master by machine category (migration 044).
//
// A Quality Master row applies to ONE machine (machine_id) or to every machine
// of a category (machine_id null, machine_category set). Category names are
// compared trimmed + case-insensitive. A blank type_of_operation = any operation.
//
// Inspection matching for a PRD stage on a machine (cumulative, per-name
// override): the machine's exact rows + its category's rows; when both define
// the same parameter name the exact machine's row wins (and within one level an
// exact-operation row beats a blank-operation one). The planned machine is
// tried the same way only when the chosen machine finds nothing (substitute).

export const normCategory = (value) => String(value ?? '').trim().toLowerCase()
const normName = (value) => String(value ?? '').trim().toLowerCase()
const isBlank = (value) => String(value ?? '').trim() === ''

/** True when the row is a category row (no machine). */
export const isCategoryRow = (row) => !row?.machine_id && !isBlank(row?.machine_category)

/** Distinct non-blank machine categories (trimmed, first spelling kept), sorted. */
export function categoryOptions(machines = []) {
  const seen = new Map()
  for (const m of machines) {
    const label = String(m?.category ?? '').trim()
    if (label && !seen.has(normCategory(label))) seen.set(normCategory(label), label)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

export function machineCategoryOf(machines = [], machineId) {
  const m = machines.find((x) => x.machine_id === machineId)
  return String(m?.category ?? '').trim()
}

/** "CNC (all)" for a category row, else the machine label (or id). */
export function appliesToLabel(row, machineLabel = (id) => id) {
  if (isCategoryRow(row)) return `${String(row.machine_category).trim()} (all)`
  return row?.machine_id ? machineLabel(row.machine_id) : ''
}

/**
 * Type of Operation options for the Quality Master form: Cycle Time operations
 * of the part on that machine, or on any machine of that category.
 */
export function operationsForTarget({ cycleTimes = [], machines = [], partSerialNumber, machineId, category }) {
  if (!partSerialNumber) return []
  let ids
  if (machineId) ids = new Set([machineId])
  else if (!isBlank(category)) {
    const c = normCategory(category)
    ids = new Set(machines.filter((m) => normCategory(m.category) === c).map((m) => m.machine_id))
  } else return []
  return [...new Set(cycleTimes
    .filter((r) => r.part_serial_number === partSerialNumber && ids.has(r.machine_id))
    .map((r) => r.operation)
    .filter(Boolean))]
}

const opMatches = (row, operation) => isBlank(row.type_of_operation) || row.type_of_operation === operation

function rowsForMachine(params, { partSerialNumber, operation, machineId, category }) {
  const forPart = params.filter((p) => p.part_serial_number === partSerialNumber && opMatches(p, operation))
  const exact = machineId ? forPart.filter((p) => p.machine_id === machineId) : []
  const c = normCategory(category)
  const cat = c ? forPart.filter((p) => isCategoryRow(p) && normCategory(p.machine_category) === c) : []
  // rank: 0 exact machine + exact op, 1 exact machine + any op, 2 category + exact op, 3 category + any op
  const ranked = [
    ...exact.map((p) => ({ p, rank: isBlank(p.type_of_operation) ? 1 : 0 })),
    ...cat.map((p) => ({ p, rank: isBlank(p.type_of_operation) ? 3 : 2 })),
  ]
  const best = new Map()
  ranked.forEach(({ p, rank }, order) => {
    const key = normName(p.quality_parameter)
    const cur = best.get(key)
    if (!cur || rank < cur.rank) best.set(key, { p, rank, order: cur?.order ?? order })
  })
  return [...best.values()].sort((a, b) => a.order - b.order).map((x) => x.p)
}

/**
 * Parameters for an inspection. machines = Machine Master rows (for the
 * category of the chosen / planned machine). Returns { params, note, source }
 * where source is 'chosen' | 'planned' | null (nothing found).
 */
export function qualityParamsForStage({ params = [], partSerialNumber, operation, chosenId, plannedId, machines = [] }) {
  const own = rowsForMachine(params, { partSerialNumber, operation, machineId: chosenId, category: machineCategoryOf(machines, chosenId) })
  if (own.length) return { params: own, note: '', source: 'chosen' }
  if (!plannedId || plannedId === chosenId) return { params: [], note: '', source: null }
  const fallback = rowsForMachine(params, { partSerialNumber, operation, machineId: plannedId, category: machineCategoryOf(machines, plannedId) })
  return fallback.length
    ? { params: fallback, note: `parameters from planned machine ${plannedId}`, source: 'planned' }
    : { params: [], note: '', source: null }
}

/** Empty-result text: 'for P1 - Rough Turning (MC-004 / CNC)'. */
export function noParamsMessage({ partSerialNumber, operation, machineId, category }) {
  const where = [machineId, String(category ?? '').trim()].filter(Boolean).join(' / ')
  return `No quality parameters are defined for ${partSerialNumber ?? ''} - ${operation ?? ''}${where ? ` (${where})` : ''}. Add them in Quality Master before an inspection can be logged here.`
}

/** Quality Status parameter filter options for a picked machine: its own rows + its category's rows. */
export function parameterNamesForMachine(qualityParams = [], machines = [], machineId) {
  const c = normCategory(machineCategoryOf(machines, machineId))
  return qualityParams
    .filter((p) => p.machine_id === machineId || (c && isCategoryRow(p) && normCategory(p.machine_category) === c))
    .map((p) => p.quality_parameter)
}
