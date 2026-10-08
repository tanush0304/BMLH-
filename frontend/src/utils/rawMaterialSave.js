// Raw Material Master: the material and its supplier links can't be
// inserted as one DB transaction from the app, so the sequencing and
// failure handling live here as a plain function -- saveMaterial and
// insertSupplierRow are injected, so this is fully testable without a
// real Supabase client.
//
// Outcomes:
//   - 'material-failed'  -- the material insert/update itself failed.
//     Nothing else was attempted; no supplier row was touched.
//   - 'suppliers-failed' -- the material saved, but a supplier row failed
//     partway through. `insertedRows` lists what DID succeed before the
//     failure (including rows skipped as already-existing -- see below),
//     so the caller can mark those persisted and leave only the real
//     failures as retryable drafts.
//   - 'success'          -- material and every supplier row saved.
//
// A 23505 (unique violation) on a supplier row is treated as "already
// linked", not a failure -- the defence against a retry recreating a
// duplicate (raw_material_code, supplier_id) pair, on top of the caller
// normally only re-submitting rows that don't have a real id yet.
export async function saveRawMaterialWithSuppliers({ materialPayload, supplierRows, saveMaterial, insertSupplierRow }) {
  let material
  try {
    material = await saveMaterial(materialPayload)
  } catch (e) {
    return { status: 'material-failed', error: e.message }
  }

  const insertedRows = []
  for (const row of supplierRows) {
    try {
      const inserted = await insertSupplierRow(row)
      insertedRows.push(inserted)
    } catch (e) {
      if (e.code === '23505') {
        insertedRows.push({ ...row, _alreadyExisted: true })
        continue
      }
      return { status: 'suppliers-failed', material, insertedRows, failedRow: row, error: e.message }
    }
  }
  return { status: 'success', material, insertedRows }
}

/**
 * Validates draft supplier rows before anything is saved: a supplier is
 * chosen, the same supplier isn't listed twice (counting rows already
 * persisted for this material too), and price/lead time are blank or
 * not negative. Returns an error string, or null if everything's valid.
 */
export function validateSupplierDraftRows(rows, existingSupplierIds = []) {
  const seen = new Set(existingSupplierIds)
  for (const row of rows) {
    if (!row.supplier_id) return 'Every supplier row needs a supplier chosen.'
    if (seen.has(row.supplier_id)) return `Supplier ${row.supplier_id} is listed more than once.`
    seen.add(row.supplier_id)

    for (const [field, label] of [
      ['standard_purchase_price', 'Price'],
      ['lead_time_days', 'Lead Time'],
    ]) {
      const v = row[field]
      if (v !== '' && v !== null && v !== undefined && Number(v) < 0) {
        return `${label} cannot be negative.`
      }
    }
  }
  return null
}

// The three migration-023 fields need DB-friendly values: opening_stock is
// NOT NULL DEFAULT 0 (blank -> 0), cost_per_unit is numeric (blank -> null),
// rm_source has a check constraint (blank -> null). Everything else in the
// form is sent exactly as before.
export function rawMaterialPayload(form) {
  const blank = (v) => v === '' || v === null || v === undefined
  return {
    ...form,
    rm_source: blank(form.rm_source) ? null : form.rm_source,
    opening_stock: blank(form.opening_stock) ? 0 : Number(form.opening_stock),
    cost_per_unit: blank(form.cost_per_unit) ? null : Number(form.cost_per_unit),
  }
}
