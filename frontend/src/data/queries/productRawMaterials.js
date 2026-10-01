import { supabase } from '../../lib/supabaseClient'

const TABLE = 'product raw materials'

export async function listProductRawMaterials(productCode) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('product_code', productCode)
  if (error) throw error
  return data
}

export async function listAllProductRawMaterials() {
  const { data, error } = await supabase.from(TABLE).select('*')
  if (error) throw error
  return data
}

/** Replaces the full BOM for a product with `rows` ([{ raw_material_code, consumption_per_unit }]). */
export async function setProductRawMaterials(productCode, rows) {
  const { error: delErr } = await supabase.from(TABLE).delete().eq('product_code', productCode)
  if (delErr) throw delErr
  if (rows.length === 0) return
  const { error: insErr } = await supabase
    .from(TABLE)
    .insert(rows.map((r) => ({ product_code: productCode, raw_material_code: r.raw_material_code, consumption_per_unit: r.consumption_per_unit })))
  if (insErr) throw insErr
}
