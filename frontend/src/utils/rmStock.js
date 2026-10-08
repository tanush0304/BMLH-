// Same figure as the "raw material stock master" view (migration 023):
// floor(closing stock / consumption per unit) for one part + raw material.
// Returns null when there's no BOM row for that pair (or consumption <= 0).
export function unitsProducible(closingStock, bomRows, partSerialNumber, rawMaterialCode) {
  const row = bomRows.find(
    (r) => r.part_serial_number === partSerialNumber && r.raw_material_code === rawMaterialCode
  )
  const consumption = Number(row?.consumption_per_unit)
  if (!row || !(consumption > 0)) return null
  return Math.floor(Number(closingStock ?? 0) / consumption)
}

// RM Issue: quantity must be > 0 and not more than the closing stock
// ("raw material stock balance".current_stock = opening + receipts - issues).
export function validateRmIssueQuantity(qty, closingStock) {
  const quantity = Number(qty)
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Quantity issued must be a number greater than zero.'
  const stock = Number(closingStock ?? 0)
  if (quantity > stock) return `Quantity issued (${quantity}) is more than the current stock (${stock}).`
  return null
}
