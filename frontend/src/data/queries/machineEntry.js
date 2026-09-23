import { supabase } from '../../lib/supabaseClient'

/**
 * §4's auto-resolve, at the data layer: for a machine, finds every PRD
 * that currently has an eligible stage (Pending, Internal, operation the
 * machine can perform) and the lowest-seq such stage per PRD.
 */
export async function listEligibleStagesForMachine(machineId) {
  const { data: ops, error: opsErr } = await supabase
    .from('machine ops')
    .select('operation')
    .eq('machine_id', machineId)
  if (opsErr) throw opsErr
  const operations = ops.map((o) => o.operation)
  if (operations.length === 0) return []

  const { data: stages, error: stagesErr } = await supabase
    .from('production route card stages')
    .select('*')
    .eq('type', 'Internal')
    .eq('status', 'Pending')
    .in('operation', operations)
    .order('seq')
  if (stagesErr) throw stagesErr

  const byPrd = new Map()
  for (const stage of stages) {
    if (!byPrd.has(stage.prd_no)) byPrd.set(stage.prd_no, stage)
  }
  return [...byPrd.values()]
}
