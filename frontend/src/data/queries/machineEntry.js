import { supabase } from '../../lib/supabaseClient'

/**
 * §4's auto-resolve, at the data layer: for a machine, finds every PRD
 * that currently has an eligible stage (Pending, Internal, operation the
 * machine can perform) and the lowest-seq such stage per PRD.
 *
 * Sequence is no longer enforced here -- WIP Receipt/Issue means a stage
 * can legitimately be fed out of order (e.g. from WIP holding rather than
 * directly from the stage before it), so "every earlier stage resolved"
 * is no longer a valid gate. The safety mechanism is now the lock in
 * MachineEntryScreen (getOpenLogForStage): once a (prd_no, stage_id) has
 * an open production log, later sessions resume that log rather than
 * opening a second one, so a stage can't be double-reserved.
 *
 * Known gap: if a machine has more than one eligible stage for the same
 * PRD now that sequence doesn't collapse the candidates for you, this
 * still silently picks the lowest-seq one -- there's no picker yet for an
 * operator who specifically wants a later stage. Flagged, not fixed here.
 */
export async function listEligibleStagesForMachine(machineId) {
  const { data: ops, error: opsErr } = await supabase
    .from('machine ops')
    .select('operation')
    .eq('machine_id', machineId)
  if (opsErr) throw opsErr
  const operations = ops.map((o) => o.operation)
  if (operations.length === 0) return []

  const { data: candidates, error: candidatesErr } = await supabase
    .from('production route card stages')
    .select('*')
    .eq('type', 'Internal')
    .eq('status', 'Pending')
    .in('operation', operations)
    .order('seq')
  if (candidatesErr) throw candidatesErr

  const byPrd = new Map()
  for (const stage of candidates) {
    if (byPrd.has(stage.prd_no)) continue
    byPrd.set(stage.prd_no, stage)
  }
  return [...byPrd.values()]
}
