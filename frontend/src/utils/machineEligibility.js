// Pure "can this machine run this stage" logic. Eligibility comes from
// Cycle Time Master rows (part_serial_number + seq + machine_id) -- the route
// itself says which machines can run which stage -- never from text-
// matching an operation name against "machine operations" (Machine
// Master's own operation list is informational only; HPV2's route uses
// names like "Rough Turning ONE" while "machine operations" holds BMLH's
// generic names like "Rough Turning", so a text match would never find a
// match for that route at all).
//
// Both directions operate on the same in-memory cycleTimeRows shape:
// { part_serial_number, seq, machine_id, ... }. Callers fetch rows filtered by
// part_serial_number from the DB (cheap, one product's rows) and pass them in
// here -- the partSerialNumber parameter is a defensive second filter, so an
// unknown/undefined part serial number always resolves to "nothing eligible"
// rather than silently matching across products.

/** Every stage (from `stages`, matched by seq) this machine can run for
 * this product. Returns the actual stage objects, not just seq numbers. */
export function stagesEligibleForMachine({ stages, cycleTimeRows, partSerialNumber, machineId }) {
  if (!partSerialNumber || !machineId) return []
  const eligibleSeqs = new Set(
    cycleTimeRows.filter((r) => r.part_serial_number === partSerialNumber && r.machine_id === machineId).map((r) => r.seq)
  )
  return stages.filter((s) => eligibleSeqs.has(s.seq))
}

/** Every machine capable of running at least one of `seqs` for this
 * product. Returns raw {machine_id, seq} rows, not deduped -- the caller
 * (Production Data Entry) intersects a specific machine's rows against the PRD's
 * own stage list once a machine is chosen, same as before this fix. */
export function machinesEligibleForSeqs({ cycleTimeRows, partSerialNumber, seqs }) {
  if (!partSerialNumber || !seqs || seqs.length === 0) return []
  const seqSet = new Set(seqs)
  return cycleTimeRows
    .filter((r) => r.part_serial_number === partSerialNumber && seqSet.has(r.seq))
    .map((r) => ({ machine_id: r.machine_id, seq: r.seq }))
}

// ---------------------------------------------------------------------------
// Substitute machines (option A, behind MACHINE_CHOICE_MODE).

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const nameOf = (machines, id) => {
  const m = machines.find((x) => x.machine_id === id)
  return m ? `${m.machine_name} (${id})` : id
}

/**
 * Machine options for ONE stage, planned machine first.
 *   mode            'capable' | 'category' | 'any'
 *   stage           { seq, operation, machine_id }  (route card stage)
 *   plannedMachine  planned machine id (default: stage.machine_id)
 *   machineOps      "machine operations" rows { machine_id, operation }
 *   machines        "machines master" rows { machine_id, machine_name, category }
 *   cycleTimeRows   Cycle Time Master rows of the part { machine_id, seq } (today's rule)
 *   openLogs        open logs { machine_id, prd_no, stage_seq } -> "— busy: PRD-xxx Stage n"
 * Returns [{ machine_id, label, planned, busy, source }].
 */
export function machinesForStage({ mode = 'capable', stage, plannedMachine, machineOps = [], machines = [], cycleTimeRows = [], openLogs = [] }) {
  if (!stage) return []
  const planned = plannedMachine ?? stage.machine_id ?? null
  const plannedRow = machines.find((m) => m.machine_id === planned)
  const ids = new Map() // machine_id -> source (first wins)
  const add = (id, source) => { if (id && !ids.has(id)) ids.set(id, source) }

  add(planned, 'planned')
  for (const r of cycleTimeRows) if (r.seq === stage.seq) add(r.machine_id, 'cycle time')
  if (mode === 'any') {
    for (const m of machines) add(m.machine_id, 'any')
  } else if (mode === 'category') {
    for (const m of machines) if (plannedRow?.category && m.category === plannedRow.category) add(m.machine_id, 'category')
  } else {
    const op = norm(stage.operation)
    const capable = machineOps.filter((r) => op && norm(r.operation) === op).map((r) => r.machine_id)
    if (capable.length) for (const id of capable) add(id, 'operation')
    else for (const m of machines) if (plannedRow?.category && m.category === plannedRow.category) add(m.machine_id, 'category')
  }

  const out = [...ids.entries()].map(([machine_id, source]) => {
    const busyLog = openLogs.find((l) => l.machine_id === machine_id)
    const busy = busyLog ? { prd_no: busyLog.prd_no, stage_seq: busyLog.stage_seq } : null
    const isPlanned = machine_id === planned
    let label = nameOf(machines, machine_id)
    if (isPlanned) label += ' (planned)'
    if (busy) label += ` — busy: ${busy.prd_no}${busy.stage_seq != null ? ` Stage ${busy.stage_seq}` : ''}`
    return { machine_id, label, planned: isPlanned, busy, source }
  })
  return out.sort((a, b) => (a.planned === b.planned ? a.machine_id.localeCompare(b.machine_id) : a.planned ? -1 : 1))
}

/** A reason is needed when the chosen machine is not the planned one. */
export function substituteReasonRequired(chosenId, plannedId) {
  return Boolean(chosenId && plannedId && chosenId !== plannedId)
}

/** Error text or null for the substitute reason inputs (mirrors 040's checks). */
export function validateSubstituteReason({ chosenId, plannedId, reason, note }) {
  if (!substituteReasonRequired(chosenId, plannedId)) return null
  if (!reason) return `${chosenId} is not the planned machine (${plannedId}) -- choose a substitute reason.`
  if (reason === 'Other' && !String(note ?? '').trim()) return 'Enter the reason text for "Other".'
  return null
}

/**
 * Cycle time for the chosen machine: its own Cycle Time Master row when it
 * has one, else the stage's frozen cycle time with a note (display only).
 */
export function cycleTimeForMachine({ cycleTimeRows = [], seq, chosenId, plannedId, frozenCycleTime }) {
  const own = cycleTimeRows.find((r) => r.seq === seq && r.machine_id === chosenId && r.cycle_time_min != null)
  if (own) return { cycleTimeMin: own.cycle_time_min, note: '' }
  if (frozenCycleTime == null) return { cycleTimeMin: null, note: '' }
  return {
    cycleTimeMin: frozenCycleTime,
    note: chosenId && chosenId !== plannedId
      ? `Cycle time ${frozenCycleTime} min (from planned machine ${plannedId} — no entry for ${chosenId})`
      : '',
  }
}

/**
 * Quality Master parameters for an inspection: the chosen machine's for the
 * part + operation, else the planned machine's with a note.
 */
export function qualityParamsForMachine({ params = [], partSerialNumber, operation, chosenId, plannedId }) {
  const match = (id) => params.filter((p) =>
    p.part_serial_number === partSerialNumber && p.machine_id === id && (!p.type_of_operation || p.type_of_operation === operation))
  const own = match(chosenId)
  if (own.length || !plannedId || plannedId === chosenId) return { params: own, note: '' }
  const fallback = match(plannedId)
  return { params: fallback, note: fallback.length ? `parameters from planned machine ${plannedId}` : '' }
}

/** "MC-005 (planned MC-004)" when they differ, else the actual machine. */
export function actualVsPlanned(actualId, plannedId) {
  if (!actualId) return ''
  return plannedId && plannedId !== actualId ? `${actualId} (planned ${plannedId})` : actualId
}

/** Shift Verification line for a substituted log, '' when not substituted. */
export function substituteLine({ actualLabel, plannedLabel, actualId, plannedId, reason, note }) {
  if (!actualId || !plannedId || actualId === plannedId) return ''
  const why = reason ? `, reason: ${reason}${reason === 'Other' && note ? ` – ${note}` : ''}` : ''
  return `Substitute machine: ${actualLabel ?? actualId} (planned ${plannedLabel ?? plannedId})${why}`
}

/**
 * Machine text for a stage row (Order Traceability, route card status print):
 * the planned machine, or the machine(s) the logs actually ran on followed by
 * "(planned X)" when any differs. logs = this stage's production logs.
 */
export function stageMachineDisplay({ plannedId, logs = [] }) {
  const actual = [...new Set(logs.map((l) => l.machine_id).filter(Boolean))].sort()
  if (!actual.length || actual.every((id) => id === plannedId)) return plannedId ?? ''
  return plannedId ? `${actual.join(', ')} (planned ${plannedId})` : actual.join(', ')
}

/** Open logs with their stage seq, for machinesForStage's busy labels. */
export function openLogsWithSeq(openLogs = [], stages = []) {
  return openLogs.map((l) => ({ ...l, stage_seq: stages.find((s) => s.id === l.stage_id)?.seq ?? null }))
}
