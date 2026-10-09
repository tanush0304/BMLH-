import { listCustomerOrders } from './customerOrders'
import { listCustomers } from './customers'
import { listProducts } from './products'
import { listRouteCards, listAllStages } from './routeCards'
import { derivePlanStatus } from '../../utils/calculations'

/** Customer orders that don't have a route card yet -- an order can only be planned once. */
export async function listOrdersAvailableForPlanning() {
  const [orders, cards] = await Promise.all([listCustomerOrders(), listRouteCards()])
  const plannedPrds = new Set(cards.map((c) => c.prd_no))
  return orders.filter((o) => !plannedPrds.has(o.prd_no))
}

/** Production Planning List: route cards joined client-side to orders/customers/products,
 * with Status derived from stages rather than stored. */
export async function listProductionPlans() {
  const [cards, orders, customers, products, allStages] = await Promise.all([
    listRouteCards(),
    listCustomerOrders(),
    listCustomers(),
    listProducts(),
    listAllStages(),
  ])

  const stagesByPrd = new Map()
  for (const s of allStages) {
    if (!stagesByPrd.has(s.prd_no)) stagesByPrd.set(s.prd_no, [])
    stagesByPrd.get(s.prd_no).push(s)
  }

  return cards.map((card) => {
    const order = orders.find((o) => o.prd_no === card.prd_no)
    const customer = customers.find((c) => c.customer_id === order?.customer_id)
    const product = products.find((p) => p.part_serial_number === order?.part_serial_number)
    return {
      ...card,
      customer_order_no: card.prd_no,
      customer_name: customer?.customer_name ?? '',
      part_serial_number: order?.part_serial_number ?? '',
      part_name: product?.part_name ?? '',
      part_drawing_reference_number: product?.part_drawing_reference_number ?? '',
      order_qty: order?.order_qty ?? '',
      expected_delivery: order?.expected_delivery ?? '',
      status: derivePlanStatus(stagesByPrd.get(card.prd_no) ?? []),
    }
  })
}
