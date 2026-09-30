import { supabase } from '../../lib/supabaseClient'

/**
 * §4's auto-resolve, at the data layer: for a machine, finds every eligible
 * stage (Pending, Internal, operation the machine can perform) across every
 * PRD -- including MORE THAN ONE stage for the same PRD, now that sequence
 * doesn't collapse the candidates for you (WIP Receipt/Issue means a stage
 * can legitimately be fed out of order). The caller (MachineEntryScreen) is
 * responsible for asking the user which stage they mean when a PRD has
 * more than one; this used to silently pick the lowest-seq one, which is
 * the gap that was fixed.
 *
 * The safety mechanism against double-working the same stage is the lock in
 * MachineEntryScreen (getOpenLogForStage): once a (prd_no, stage_id) has an
 * open production log, later sessions resume that log rather than opening
 * a second one.
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

  return candidates
}
