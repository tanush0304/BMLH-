import { supabase } from '../../lib/supabaseClient'
import { isStageReachable } from '../../utils/calculations'

/**
 * §4's auto-resolve, at the data layer: for a machine, finds every PRD
 * that currently has an eligible stage (Pending, Internal, operation the
 * machine can perform, AND every earlier stage of that PRD already
 * resolved) and the lowest-seq such stage per PRD.
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
  if (candidates.length === 0) return []

  const prdNos = [...new Set(candidates.map((c) => c.prd_no))]
  const { data: allStages, error: allStagesErr } = await supabase
    .from('production route card stages')
    .select('prd_no, seq, type, status')
    .in('prd_no', prdNos)
  if (allStagesErr) throw allStagesErr

  const stagesByPrd = new Map()
  for (const s of allStages) {
    if (!stagesByPrd.has(s.prd_no)) stagesByPrd.set(s.prd_no, [])
    stagesByPrd.get(s.prd_no).push(s)
  }

  const byPrd = new Map()
  for (const stage of candidates) {
    if (byPrd.has(stage.prd_no)) continue
    if (isStageReachable(stage, stagesByPrd.get(stage.prd_no) ?? [])) {
      byPrd.set(stage.prd_no, stage)
    }
  }
  return [...byPrd.values()]
}
