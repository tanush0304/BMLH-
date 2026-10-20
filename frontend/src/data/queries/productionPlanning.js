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
    }
  })
}
