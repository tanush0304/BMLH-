import { supabase } from '../../lib/supabaseClient'

const TABLE = 'production batch master'

export async function listProductionBatches() {
  const { data, error } = await supabase.from(TABLE).select('*').order('product_code')
  if (error) throw error
  return data
}

export async function createProductionBatch(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateProductionBatch(productCode, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('product_code', productCode)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProductionBatch(productCode) {
  const { error } = await supabase.from(TABLE).delete().eq('product_code', productCode)
  if (error) throw error
}
