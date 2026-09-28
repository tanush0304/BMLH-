import { supabase } from '../../lib/supabaseClient'

const CARDS_TABLE = 'production route cards'
const STAGES_TABLE = 'production route card stages'

export async function listRouteCards() {
  const { data, error } = await supabase.from(CARDS_TABLE).select('*').order('prd_no')
  if (error) throw error
  return data
}

/** All stages across every PRD, for building list views without N+1 queries. */
export async function listAllStages() {
  const { data, error } = await supabase.from(STAGES_TABLE).select('*')
  if (error) throw error
  return data
}

export async function getStagesForPrd(prdNo) {
  const { data, error } = await supabase.from(STAGES_TABLE).select('*').eq('prd_no', prdNo).order('seq')
  if (error) throw error
  return data
}

export async function updateStageStatus(stageId, status, actualDate) {
  const { data, error } = await supabase
    .from(STAGES_TABLE)
    .update({ status, actual_date: actualDate ?? new Date().toISOString().slice(0, 10) })
    .eq('id', stageId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Generates a route card for a PRD by snapshotting the product's CURRENT
 * cycle time master rows into production_route_card_stages -- a frozen
 * copy at this moment, per §5. Later edits to Cycle Time Master must not
 * retroactively change an already-generated card.
 */
export async function generateRouteCard({ prdNo, productCode, batchQty, shiftHours }) {
  const { data: cycleRows, error: cycleErr } = await supabase
    .from('cycle time master')
    .select('*')
    .eq('product_code', productCode)
    .order('seq')
  if (cycleErr) throw cycleErr
  if (cycleRows.length === 0) {
    throw new Error(`No Cycle Time Master rows found for product "${productCode}" -- nothing to snapshot.`)
  }

  const { data: card, error: cardErr } = await supabase
    .from(CARDS_TABLE)
    .insert({
      prd_no: prdNo,
      batch_qty: batchQty === '' ? null : Number(batchQty),
      shift_hours: shiftHours === '' ? null : Number(shiftHours),
    })
    .select()
    .single()
  if (cardErr) throw cardErr

  const stageRows = cycleRows.map((r) => ({
    prd_no: prdNo,
    seq: r.seq,
    operation: r.operation,
    type: r.type,
    machine_id: r.machine_id,
    job_work_code: r.job_work_code,
    cycle_time_min: r.cycle_time_min,
    status: 'Pending',
  }))
  const { error: stageErr } = await supabase.from(STAGES_TABLE).insert(stageRows)
  if (stageErr) throw stageErr

  return card
}
