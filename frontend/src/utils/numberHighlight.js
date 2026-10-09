// Quantity / amount values in lists and totals are shown in blue via the
// shared `num-highlight` class (index.css). A column opts in with
// `numeric: true`, or is recognised by its key.
export const NUM_HIGHLIGHT_CLASS = 'num-highlight'

const QUANTITY_KEY = /(^|_)(qty|quantity|amount|stock|receipts|issued|balance|total|producible|despatched|received|produced|rejected|rework|cost|price|value)(_|$)/i
const NON_QUANTITY_KEY = /(^|_)(date|no|id|code|name|status|type|label|remarks|unit|uom|measurement)$/i

export function isQuantityColumn(col) {
  if (!col || col.type === 'status') return false
  if (col.numeric) return true
  const key = String(col.key ?? '')
  return QUANTITY_KEY.test(key) && !NON_QUANTITY_KEY.test(key)
}
