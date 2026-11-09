// Type of Order (Labour / Manufacturing) of a PRD, from its PO line
// ("customer orders".order_type) -- read-only on FG Despatch (field audit).
export function orderTypeForPrd(orders, prdNo) {
  if (!prdNo) return ''
  return orders.find((o) => o.prd_no === prdNo)?.order_type ?? ''
}

// Labour order = customer-supplied material: Production Planning skips the
// BOM and RM stock checks for it.
export const LABOUR_ORDER_NOTE = 'Labour order: no RM stock check'
export function isLabourOrder(line) {
  return String(line?.order_type ?? '').trim().toLowerCase() === 'labour'
}

// PO line Order Type (Phase C): required, default Manufacturing.
export const ORDER_TYPES = ['Labour', 'Manufacturing']
export const DEFAULT_ORDER_TYPE = 'Manufacturing'
export const ORDER_TYPE_REQUIRED = 'Order Type is required.'
export function orderTypeProblem(value) {
  const v = String(value ?? '').trim()
  return ORDER_TYPES.includes(v) ? null : ORDER_TYPE_REQUIRED
}
