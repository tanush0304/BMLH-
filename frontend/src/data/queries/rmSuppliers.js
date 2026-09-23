import { supabase } from '../../lib/supabaseClient'

const TABLE = 'rm suppliers'

export async function listSuppliersForRawMaterial(rawMaterialCode) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('raw_material_code', rawMaterialCode)
  if (error) throw error
  return data
}

export async function createRmSupplierLink(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteRmSupplierLink(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
