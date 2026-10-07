import { supabase } from '../../lib/supabaseClient'

const TABLE = 'production batch master'

export async function listProductionBatches() {
  const { data, error } = await supabase.from(TABLE).select('*').order('part_serial_number')
  if (error) throw error
  return data
}

export async function createProductionBatch(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateProductionBatch(partSerialNumber, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('part_serial_number', partSerialNumber)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProductionBatch(partSerialNumber) {
  const { error } = await supabase.from(TABLE).delete().eq('part_serial_number', partSerialNumber)
  if (error) throw error
}
