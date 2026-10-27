// Customer order line checks, run before any DB call.
import { validateNumber, NUMBER_RULES } from './numericFields'

/** Message for a bad order line (qty, or delivery before PO date), else null.
 * Dates are YYYY-MM-DD strings from <input type="date">; blank delivery is allowed. */
export function orderLineError({ orderQty, poDate, expectedDelivery }) {
  const qtyError = validateNumber(orderQty, { label: 'Order Qty', required: true, ...NUMBER_RULES.QTY })
  if (qtyError) return qtyError
  if (poDate && expectedDelivery && expectedDelivery < poDate) {
    return "Expected Delivery can't be before the PO Date."
  }
  return null
}
