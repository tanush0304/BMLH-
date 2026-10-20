// Type of Order (Labour / Manufacturing) of a PRD, from its PO line
// ("customer orders".order_type) -- read-only on FG Despatch (field audit).
export function orderTypeForPrd(orders, prdNo) {
  if (!prdNo) return ''
  return orders.find((o) => o.prd_no === prdNo)?.order_type ?? ''
}
