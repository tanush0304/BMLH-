import { supabase } from '../../lib/supabaseClient'
import { nextSequenceNo } from '../../utils/numbering'
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
 * Next JC number is the highest existing "JC-NNN" suffix + 1 -- the same
 * pattern as PRD-NNN / DC-NNN. Migration 018 backfilled existing cards and
 * made jc_no unique, so a genuine collision surfaces as a Postgres 23505.
 */
export async function generateNextJcNo() {
  const { data, error } = await supabase.from(CARDS_TABLE).select('jc_no')
  if (error) throw error
  return nextSequenceNo('JC', data.map((r) => r.jc_no))
}

/**
 * Generates a route card for a PRD by snapshotting the product's CURRENT
 * cycle time master rows into production_route_card_stages -- a frozen
 * copy at this moment, per §5. Later edits to Cycle Time Master must not
 * retroactively change an already-generated card.
 */
export async function generateRouteCard({ prdNo, partSerialNumber, batchQty, shiftHours, availableRmQtySnapshot, unitsProducible }) {
  const { data: cycleRows, error: cycleErr } = await supabase
    .from('cycle time master')
    .select('*')
    .eq('part_serial_number', partSerialNumber)
    .order('seq')
    .order('id')
  if (cycleErr) throw cycleErr
  if (cycleRows.length === 0) {
    throw new Error(`No Cycle Time Master rows found for product "${partSerialNumber}" -- nothing to snapshot.`)
  }

  const jcNo = await generateNextJcNo()
  const { data: card, error: cardErr } = await supabase
    .from(CARDS_TABLE)
    .insert({
      jc_no: jcNo,
      prd_no: prdNo,
      batch_qty: toNumberOrNull(batchQty),
      shift_hours: toNumberOrNull(shiftHours),
      // Snapshotted at planning time, same as batch_qty/shift_hours -- a
      // frozen record of what was available/producible when this was
      // planned, not a live-recomputed figure. Left null when the product
      // has no BOM row yet (Production Planning shows "Pending BOM" for
      // that case and never computes a value to pass here).
      available_rm_qty_snapshot: availableRmQtySnapshot ?? null,
      units_producible: unitsProducible ?? null,
    })
    .select()
    .single()
  if (cardErr) throw cardErr

  // Cycle Time Master is "long format" -- an Internal operation can have
  // several rows, one per machine capable of running it (e.g. "Rough
  // Turning ONE" has one row per CNC). A route card needs exactly one
  // stage per seq, so collapse each seq down to a single row: prefer a
  // machine not already picked for an earlier stage in this route (so a
  // demo route doesn't pile every stage onto the same machine), falling
  // back to the lowest machine_id once every candidate has been used.
  // The chosen machine_id is only a DEFAULT -- Production Data Entry must keep
  // offering any machine with a Cycle Time Master row for this
  // product+seq, not just this one. Whether planners should instead
  // assign the machine explicitly at planning time is still open.
  const bySeq = new Map()
  for (const r of cycleRows) {
    if (!bySeq.has(r.seq)) bySeq.set(r.seq, [])
    bySeq.get(r.seq).push(r)
  }
  const usedMachines = new Set()
  const stageRows = [...bySeq.entries()]
    .sort(([seqA], [seqB]) => seqA - seqB)
    .map(([, rows]) => {
      if (rows[0].type !== 'Internal') return rows[0]
      const unused = rows.find((r) => !usedMachines.has(r.machine_id))
      const chosen = unused ?? [...rows].sort((a, b) => (a.machine_id > b.machine_id ? 1 : -1))[0]
      usedMachines.add(chosen.machine_id)
      return chosen
    })
    .map((r) => ({
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
