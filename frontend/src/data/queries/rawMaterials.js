import { supabase } from '../../lib/supabaseClient'

const TABLE = 'raw materials master'

export async function listRawMaterials() {
  const { data, error } = await supabase.from(TABLE).select('*').order('raw_material_code')
  if (error) throw error
  return data
}

export async function createRawMaterial(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateRawMaterial(rawMaterialCode, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('raw_material_code', rawMaterialCode)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteRawMaterial(rawMaterialCode) {
  const { error } = await supabase.from(TABLE).delete().eq('raw_material_code', rawMaterialCode)
  if (error) throw error
}
