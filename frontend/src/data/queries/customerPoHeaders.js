import { supabase } from '../../lib/supabaseClient'

const TABLE = 'customer po headers'

export async function listPoHeaders() {
  const { data, error } = await supabase.from(TABLE).select('*').order('po_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createPoHeader(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

/** One row per PO header, with line-item count/total qty already aggregated
 * -- only POs created through the new two-level flow show up here, since
 * it's built from customer orders.parent_po_id. Older flat orders (no
 * parent_po_id) simply don't belong to any PO group and are absent from
 * this view, not shown with a blank/null grouping row. */
export async function listPoSummary() {
  const { data, error } = await supabase.from('customer po summary').select('*').order('po_date', { ascending: false })
  if (error) throw error
  return data
}

/** PO lines of a PO header, each with its PRDs (migration 030: one per
 * planned batch; "Not planned" until Production Planning runs). */
export async function listOrdersForPoHeader(poHeaderId) {
  const { data, error } = await supabase.from('customer orders').select('*').eq('parent_po_id', poHeaderId).order('order_line_id')
  if (error) throw error
  const ids = data.map((l) => l.order_line_id)
  const { data: prds, error: prdError } = ids.length
    ? await supabase.from('production orders').select('prd_no, order_line_id').in('order_line_id', ids)
    : { data: [], error: null }
  if (prdError) throw prdError
  return data.map((l) => ({
    ...l,
    prd_no: prds.filter((p) => p.order_line_id === l.order_line_id).map((p) => p.prd_no).sort().join(', ') || 'Not planned',
  }))
}
