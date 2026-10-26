import { supabase } from '../../lib/supabaseClient'
import { listCustomerOrders, listProductionOrders, listProductionOrderCancellations, joinPrdsToLines } from './customerOrders'
import { listCustomers } from './customers'
import { listProducts } from './products'
import { listRouteCards, listAllStages } from './routeCards'
import { derivePlanStatus } from '../../utils/calculations'
import { orderLineProgress } from '../../utils/batchSplit'

/** PO lines with qty still to plan (migration 030: a line is planned in
 * batches, one PRD each, possibly over several sessions). Each line carries
 * planned_qty, remaining_qty and its existing PRDs. */
export async function listOrdersAvailableForPlanning() {
  const [lines, prds] = await Promise.all([listCustomerOrders(), listProductionOrders()])
  return linesWithPlanning(lines, prds).filter((l) => l.remaining_qty > 0)
}

export function linesWithPlanning(lines, prds) {
  return lines.map((l) => {
    const own = prds.filter((p) => p.order_line_id === l.order_line_id)
    const planned = own.reduce((a, p) => a + Number(p.prd_qty), 0)
    return {
      ...l,
      planned_qty: planned,
      remaining_qty: Math.max(0, Number(l.order_qty) - planned),
      prds: own.map((p) => p.prd_no).sort(),
    }
  })
}

/** Production Planning List: one row per PRD (route card), joined to its PO
 * line / customer / product, Status derived from its stages. */
export async function listProductionPlans() {
  const [cards, lines, prds, cancellations, customers, products, allStages] = await Promise.all([
    listRouteCards(),
    listCustomerOrders(),
    listProductionOrders(),
    listProductionOrderCancellations(),
    listCustomers(),
    listProducts(),
    listAllStages(),
  ])
  const byPrd = new Map(joinPrdsToLines(prds, lines, cancellations).map((o) => [o.prd_no, o]))
  const withLogs = await prdsWithProductionLogs(cards.map((c) => c.prd_no))

  const stagesByPrd = new Map()
  for (const s of allStages) {
    if (!stagesByPrd.has(s.prd_no)) stagesByPrd.set(s.prd_no, [])
    stagesByPrd.get(s.prd_no).push(s)
  }

  return cards.map((card) => {
    const order = byPrd.get(card.prd_no)
    const customer = customers.find((c) => c.customer_id === order?.customer_id)
    const product = products.find((p) => p.part_serial_number === order?.part_serial_number)
    const stages = stagesByPrd.get(card.prd_no) ?? []
    return {
      ...card,
      customer_order_no: card.prd_no,
      po_number: order?.po_number ?? '',
      batch_label: order ? `Batch ${order.batch_no}` : '',
      line_progress: order ? orderLineProgress(order) : '',
      customer_name: customer?.customer_name ?? '',
      part_serial_number: order?.part_serial_number ?? '',
      part_name: product?.part_name ?? '',
      part_drawing_reference_number: product?.part_drawing_reference_number ?? '',
      order_qty: order?.order_qty ?? '',
      prd_qty: order?.prd_qty ?? '',
      expected_delivery: order?.expected_delivery ?? '',
      status: derivePlanStatus(stages),
      // Cancel is only offered (and only accepted by the database) while
      // nothing has started -- every stage still Pending.
      can_cancel: stages.length > 0 && stages.every((s) => s.status === 'Pending'),
      // A log exists (e.g. started then End-Logged, stage still Pending): the
      // DB refuses the cancel, so the screen shows Cancel disabled.
      has_production_logs: withLogs.has(card.prd_no),
    }
  })
}

const LOG_PAGE = 1000

/** Set of the given PRDs that have at least one "production logs" row (one
 * read of prd_no only; paged past PostgREST's 1000-row cap). */
export async function prdsWithProductionLogs(prdNos = []) {
  const wanted = [...new Set(prdNos.filter(Boolean))]
  const found = new Set()
  if (!wanted.length) return found
  for (let from = 0; ; from += LOG_PAGE) {
    const { data, error } = await supabase.from('production logs').select('prd_no').in('prd_no', wanted).range(from, from + LOG_PAGE - 1)
    if (error) throw error
    for (const r of data) found.add(r.prd_no)
    if (data.length < LOG_PAGE) return found
  }
}
