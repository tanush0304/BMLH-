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
 * (Machine Entry) intersects a specific machine's rows against the PRD's
 * own stage list once a machine is chosen, same as before this fix. */
export function machinesEligibleForSeqs({ cycleTimeRows, partSerialNumber, seqs }) {
  if (!partSerialNumber || !seqs || seqs.length === 0) return []
  const seqSet = new Set(seqs)
  return cycleTimeRows
    .filter((r) => r.part_serial_number === partSerialNumber && seqSet.has(r.seq))
    .map((r) => ({ machine_id: r.machine_id, seq: r.seq }))
}
