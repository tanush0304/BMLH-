import { supabase } from '../../lib/supabaseClient'

// Since migration 030: "customer orders" = one row per PO LINE, keyed by
// order_line_id (prd_no is a legacy column, null on new lines). PRDs live in
// "production orders" (one per batch), created by Production Planning.
const TABLE = 'customer orders'

/** PO lines. */
export async function listCustomerOrders() {
  const { data, error } = await supabase.from(TABLE).select('*').order('order_line_id')
  if (error) throw error
  return data
}

export async function createCustomerOrder(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateCustomerOrder(orderLineId, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('order_line_id', orderLineId).select().single()
  if (error) throw error
  return data
}

/** Refused by the database once the line has PRDs (FK from "production orders"). */
export async function deleteCustomerOrder(orderLineId) {
  const { error } = await supabase.from(TABLE).delete().eq('order_line_id', orderLineId)
  if (error) {
    if (error.code === '23503') throw new Error('This PO line already has PRDs -- cancel them in Production Planning first.')
    throw error
  }
}

/** All PRDs ("production orders" rows). */
export async function listProductionOrders() {
  const { data, error } = await supabase.from('production orders').select('*').order('prd_no')
  if (error) throw error
  return data
}

/** Cancelled PRDs (030): their numbers are never re-used. */
export async function listProductionOrderCancellations() {
  const { data, error } = await supabase.from('production order cancellations').select('*')
  if (error) throw error
  return data
}

/** One row per PRD with its PO line's fields -- the shape screens used to
 * get from "customer orders" when one line was one PRD: prd_no, customer,
 * PO, part, order_qty (the LINE's qty) plus prd_qty (this batch), batch_no,
 * order_line_id. Stage 1 of a PRD is capped by prd_qty. Also the line's
 * progress for batch labels: line_active_count, line_cancelled_count,
 * line_planned_qty. */
export async function listOrdersByPrd() {
  const [lines, prds, cancellations] = await Promise.all([
    listCustomerOrders(),
    listProductionOrders(),
    listProductionOrderCancellations(),
  ])
  return joinPrdsToLines(prds, lines, cancellations)
}

export function joinPrdsToLines(prds, lines, cancellations = []) {
  const byLine = new Map(lines.map((l) => [l.order_line_id, l]))
  const count = (rows) => {
    const m = new Map()
    for (const r of rows) m.set(r.order_line_id, (m.get(r.order_line_id) ?? 0) + 1)
    return m
  }
  const activeCount = count(prds)
  const cancelledCount = count(cancellations)
  const plannedQty = new Map()
  for (const p of prds) plannedQty.set(p.order_line_id, (plannedQty.get(p.order_line_id) ?? 0) + Number(p.prd_qty))
  return prds
    .filter((p) => byLine.has(p.order_line_id))
    .map((p) => {
      const line = byLine.get(p.order_line_id)
      return {
        ...line,
        legacy_prd_no: line.prd_no,
        prd_no: p.prd_no,
        prd_qty: Number(p.prd_qty),
        batch_no: p.batch_no,
        line_active_count: activeCount.get(p.order_line_id),
        line_cancelled_count: cancelledCount.get(p.order_line_id) ?? 0,
        line_planned_qty: plannedQty.get(p.order_line_id),
        order_line_id: p.order_line_id,
      }
    })
}
