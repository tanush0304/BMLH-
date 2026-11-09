import { supabase } from '../../lib/supabaseClient'

// Migration 043 (annual / open PO). Until it is run "customer orders" has no
// line_status column, so the app keeps today's behaviour and hides the new
// parts. Cached once known; a network error is not cached. Before 043 the
// probe shows one expected 400 in the browser console.
let supported = null
let probe = null

export function isMissingColumnError(error) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`
  return error?.code === '42703' || error?.code === 'PGRST204' || /column .*does not exist|could not find the .* column/i.test(text)
}

export async function openPoSupported() {
  if (supported !== null) return supported
  probe ??= (async () => {
    let error
    try {
      ;({ error } = await supabase.from('customer orders').select('line_status').limit(0))
    } catch {
      return false // no client / network: not cached, retried next call
    }
    if (!error) return (supported = true)
    if (isMissingColumnError(error)) return (supported = false)
    return false
  })().finally(() => {
    probe = null
  })
  return probe
}

export function resetOpenPoSupportedCache() {
  supported = null
  probe = null
}

const PAGE = 1000

async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < PAGE) return out
  }
}

/** View "customer order line status": per line planned / despatched and the
 * effective line_status (Open / Closed / Cancelled) + PO status / validity. */
export const listLineStatuses = () =>
  fetchAll(() => supabase.from('customer order line status').select('*').order('order_line_id'))

/** Full qty history of one line, newest first. */
export async function listLineEdits(orderLineId) {
  const { data, error } = await supabase
    .from('customer order line edits')
    .select('*')
    .eq('order_line_id', orderLineId)
    .order('edited_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getPoHeader(id) {
  const { data, error } = await supabase.from('customer po headers').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function updatePoHeader(id, payload) {
  const { data, error } = await supabase.from('customer po headers').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Supervisor / admin (043 guard); qty down only to planned. */
export async function updateLineQty(orderLineId, orderQty) {
  const { data, error } = await supabase
    .from('customer orders')
    .update({ order_qty: orderQty })
    .eq('order_line_id', orderLineId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Supervisor / admin; reason required; refused while PRDs are unstarted /
 * in production (043 guard names them). */
export async function cancelLine(orderLineId, reason) {
  const { data, error } = await supabase
    .from('customer orders')
    .update({ line_status: 'Cancelled', cancel_reason: reason })
    .eq('order_line_id', orderLineId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** PRD numbers of a line with their state inputs: stages + whether a
 * production log exists (for the client-side cancel / min-qty hints). */
export async function listPrdStatesForLine(orderLineId) {
  const { data: prds, error } = await supabase.from('production orders').select('prd_no').eq('order_line_id', orderLineId)
  if (error) throw error
  const ids = prds.map((p) => p.prd_no)
  if (!ids.length) return []
  const [{ data: stages, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
    supabase.from('production route card stages').select('prd_no, status').in('prd_no', ids),
    supabase.from('production logs').select('prd_no').in('prd_no', ids),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const withLogs = new Set(logs.map((l) => l.prd_no))
  return ids.sort().map((prd_no) => ({
    prd_no,
    stages: stages.filter((s) => s.prd_no === prd_no),
    hasLogs: withLogs.has(prd_no),
  }))
}
