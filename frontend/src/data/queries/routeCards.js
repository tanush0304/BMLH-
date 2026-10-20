import { supabase } from '../../lib/supabaseClient'
import { withStagePositions } from '../../utils/stageLabel'
import { todayISO } from '../../utils/dates'
import { toNumberOrNull } from '../../utils/numericFields'

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
  return withStagePositions(data) // display position per PRD (stageLabel)
}

export async function getStagesForPrd(prdNo) {
  const { data, error } = await supabase.from(STAGES_TABLE).select('*').eq('prd_no', prdNo).order('seq')
  if (error) throw error
  return withStagePositions(data)
}

export async function updateStageStatus(stageId, status, actualDate) {
  const { data, error } = await supabase
    .from(STAGES_TABLE)
    .update({ status, actual_date: actualDate ?? todayISO() })
    .eq('id', stageId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getRouteCard(prdNo) {
  const { data, error } = await supabase.from(CARDS_TABLE).select('*').eq('prd_no', prdNo).single()
  if (error) throw error
  return data
}

/**
 * Route stages for a part, snapshotted from its CURRENT Cycle Time Master
 * rows -- a frozen copy at planning time (later master edits never change a
 * generated card). Cycle Time Master is long format: an Internal operation
 * can have one row per capable machine; a route card needs one stage per
 * seq, so each seq collapses to one row, preferring a machine not already
 * used by an earlier stage, else the lowest machine_id. The machine is only
 * a default -- Production Data Entry still offers every capable machine.
 */
export async function buildStageSnapshot(partSerialNumber) {
  const { data: cycleRows, error } = await supabase
    .from('cycle time master')
    .select('*')
    .eq('part_serial_number', partSerialNumber)
    .order('seq')
    .order('id')
  if (error) throw error
  if (cycleRows.length === 0) {
    throw new Error(`No Cycle Time Master rows found for product "${partSerialNumber}" -- nothing to snapshot.`)
  }
  return collapseCycleRows(cycleRows)
}

export function collapseCycleRows(cycleRows) {
  const bySeq = new Map()
  for (const r of cycleRows) {
    if (!bySeq.has(r.seq)) bySeq.set(r.seq, [])
    bySeq.get(r.seq).push(r)
  }
  const usedMachines = new Set()
  return [...bySeq.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, rows]) => {
      if (rows[0].type !== 'Internal') return rows[0]
      const unused = rows.find((r) => !usedMachines.has(r.machine_id))
      const chosen = unused ?? [...rows].sort((a, b) => (a.machine_id > b.machine_id ? 1 : -1))[0]
      usedMachines.add(chosen.machine_id)
      return chosen
    })
    .map((r) => ({
      seq: r.seq,
      operation: r.operation,
      type: r.type,
      machine_id: r.machine_id ?? null,
      job_work_code: r.job_work_code ?? null,
      cycle_time_min: r.cycle_time_min ?? null,
    }))
}

/**
 * Plan batches of a PO line (migration 030): plan_production_orders creates
 * one PRD + route card (JC-NNN) + stages per batch in one transaction
 * (supervisor/admin; refuses more than the line's remaining qty). Returns the
 * new "production orders" rows.
 */
export async function planProductionOrders({ orderLineId, partSerialNumber, batches, shiftHours, availableRmQtySnapshot, unitsProducible }) {
  const stages = await buildStageSnapshot(partSerialNumber)
  const { data, error } = await supabase.rpc('plan_production_orders', {
    p_order_line_id: orderLineId,
    p_batches: batches.map(Number),
    p_shift_hours: toNumberOrNull(shiftHours),
    p_stages: stages,
    p_rm_snapshot: availableRmQtySnapshot ?? null,
    p_units_producible: unitsProducible ?? null,
  })
  if (error) throw error
  return data
}

/** Cancel a PRD that has not started (supervisor/admin, reason): its route
 * card goes, its qty returns to the PO line; the PRD / JC numbers are never
 * re-used. */
export async function cancelProductionOrder(prdNo, reason) {
  const { error } = await supabase.rpc('cancel_production_order', { p_prd_no: prdNo, p_reason: reason })
  if (error) throw error
}
