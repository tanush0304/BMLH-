export function parsePositiveQuantity(value) {
  const quantity = parseFiniteDecimal(value)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null
}

export function validateDispatchQuantity(value, physicalStock, orderBalance) {
  const quantity = parsePositiveQuantity(value)
  if (quantity === null) {
    return { quantity: null, error: 'Dispatch quantity must be a finite number greater than zero.' }
  }

  const availableStock = parseNonNegativeFinite(physicalStock)
  const remainingOrderQuantity = parseNonNegativeFinite(orderBalance)
  if (availableStock === null || remainingOrderQuantity === null) {
    return { quantity: null, error: 'Stock or remaining order quantity is unavailable for this PRD.' }
  }

  const maximumAllowed = Math.min(availableStock, remainingOrderQuantity)
  if (quantity > maximumAllowed) {
    if (availableStock <= remainingOrderQuantity) {
      return { quantity: null, error: 'Dispatch quantity cannot exceed physical FG stock for this PRD.' }
    }
    return { quantity: null, error: 'Dispatch quantity cannot exceed the remaining order quantity for this PRD.' }
  }

  return { quantity, error: null }
}

function parseNonNegativeFinite(value) {
  const quantity = parseFiniteDecimal(value)
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null
}

function parseFiniteDecimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}
