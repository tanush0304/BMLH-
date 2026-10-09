import { toNumberOrNull, withNumericFields } from './numericFields'

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

// Raw Material Master payload: every numeric column goes out as a number or
// null, never "" (Postgres rejects "" for numeric). opening_stock is NOT NULL
// DEFAULT 0, so blank -> 0. rm_source has a check constraint -> null when
// blank. diameter_mm stays text (ranges like "75 to 80").
export const RAW_MATERIAL_NUMERIC_FIELDS = ['length_mtrs', 'width', 'thickness', 'opening_stock', 'cost_per_unit']

export function rawMaterialPayload(form) {
  return {
    ...withNumericFields(form, RAW_MATERIAL_NUMERIC_FIELDS, { zeroIfBlank: ['opening_stock'] }),
    rm_source: form.rm_source ? form.rm_source : null,
  }
}

// One "rm suppliers" row: price / lead time blank -> null.
export function supplierRowPayload(row) {
  return {
    supplier_id: row.supplier_id,
    standard_purchase_price: toNumberOrNull(row.standard_purchase_price),
    lead_time_days: toNumberOrNull(row.lead_time_days),
  }
}
