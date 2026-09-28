import { supabase } from '../../lib/supabaseClient'
import { listCustomerOrders } from './customerOrders'
import { listRouteCards } from './routeCards'

const LOGS_TABLE = 'quality logs'
const READINGS_TABLE = 'quality log readings'
const RESULTS_VIEW = 'quality log results'

/** Orders that already have a route card -- an inspection can only be
 * logged against a PRD that's actually in production. */
export async function listPrdsWithRouteCard() {
  const [orders, cards] = await Promise.all([listCustomerOrders(), listRouteCards()])
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

/** Past inspections for the list: the results view (Accepted/Not Accepted
 * computed live) joined client-side to the log header and the stage's
 * operation, neither of which the view itself carries. */
export async function listQualityInspectionHistory() {
  const [{ data: results, error: resErr }, { data: logs, error: logErr }] = await Promise.all([
    supabase.from(RESULTS_VIEW).select('*'),
    supabase.from(LOGS_TABLE).select('*'),
  ])
  if (resErr) throw resErr
  if (logErr) throw logErr

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
    return {
      ...r,
      prd_no: log?.prd_no ?? '',
      machine_id: log?.machine_id ?? '',
      log_date: log?.log_date ?? '',
      operation: stage?.operation ?? '',
    }
  })
}
