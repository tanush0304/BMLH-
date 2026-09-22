import { supabase } from '../../lib/supabaseClient'

const TABLE = 'products master'

export async function listProducts() {
  const { data, error } = await supabase.from(TABLE).select('*').order('product_code')
  if (error) throw error
  return data
}

export async function createProduct(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateProduct(productCode, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('product_code', productCode)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProduct(productCode) {
  const { error } = await supabase.from(TABLE).delete().eq('product_code', productCode)
  if (error) throw error
}
