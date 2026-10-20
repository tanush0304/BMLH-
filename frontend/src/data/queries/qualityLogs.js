import { supabase } from '../../lib/supabaseClient'
import { listOrdersByPrd } from './customerOrders'
import { listRouteCards } from './routeCards'

const LOGS_TABLE = 'quality logs'
const READINGS_TABLE = 'quality log readings'
const RESULTS_VIEW = 'quality log results'

/** Orders that already have a route card -- an inspection can only be
 * logged against a PRD that's actually in production. */
export async function listPrdsWithRouteCard() {
  const [orders, cards] = await Promise.all([listOrdersByPrd(), listRouteCards()])
  const cardedPrds = new Set(cards.map((c) => c.prd_no))
  return orders.filter((o) => cardedPrds.has(o.prd_no))
}

export async function createQualityLog(payload) {
  const { data, error } = await supabase.from(LOGS_TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function createQualityLogReadings(rows) {
  if (rows.length === 0) return []
  const { data, error } = await supabase.from(READINGS_TABLE).insert(rows).select()
  if (error) throw error
  return data
}

// Supervisor/admin edit (032): header employee / shift, reading observed values.
export async function updateQualityLog(id, patch) {
  const { error } = await supabase.from(LOGS_TABLE).update(patch).eq('id', id)
  if (error) throw error
}

export async function updateQualityLogReading(id, patch) {
  const { error } = await supabase.from(READINGS_TABLE).update(patch).eq('id', id)
  if (error) throw error
}

/** Past inspections for the list: the results view (Accepted/Not Accepted
 * computed live) joined client-side to the log header and the stage's
 * operation, neither of which the view itself carries. */
export async function listQualityInspectionHistory() {
  // Readings table with '*': its edited_by / edited_at (032) are read when
  // present, and the list still loads before 032 is run.
  const [{ data: results, error: resErr }, { data: logs, error: logErr }, { data: readingRows, error: rdErr }] = await Promise.all([
    supabase.from(RESULTS_VIEW).select('*'),
    supabase.from(LOGS_TABLE).select('*'),
    supabase.from(READINGS_TABLE).select('*'),
  ])
  if (resErr) throw resErr
  if (logErr) throw logErr
  if (rdErr) throw rdErr
  const readingById = new Map(readingRows.map((x) => [x.id, x]))

  const stageIds = [...new Set(logs.map((l) => l.stage_id))]
  const { data: stages, error: stageErr } = await supabase
    .from('production route card stages')
    .select('id, operation')
    .in('id', stageIds.length ? stageIds : [-1])
  if (stageErr) throw stageErr
  const stageById = new Map(stages.map((s) => [s.id, s]))
  const logById = new Map(logs.map((l) => [l.id, l]))

  return results.map((r) => {
    const log = logById.get(r.quality_log_id)
    const stage = log ? stageById.get(log.stage_id) : null
    const reading = readingById.get(r.reading_id)
    // Latest edit of the reading or its header, for the "Edited" badge.
    const edit = [reading, log].filter((x) => x?.edited_at).sort((a, b) => String(b.edited_at).localeCompare(String(a.edited_at)))[0]
    return {
      ...r,
      prd_no: log?.prd_no ?? '',
      machine_id: log?.machine_id ?? '',
      log_date: log?.log_date ?? '',
      employee_id: log?.employee_id ?? '',
      shift_code: log?.shift_code ?? '',
      operation: stage?.operation ?? '',
      edited_by: edit?.edited_by ?? null,
      edited_at: edit?.edited_at ?? null,
    }
  })
}
