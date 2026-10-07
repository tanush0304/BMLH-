import { supabase } from '../../lib/supabaseClient'

const TABLE = 'quality master'

export async function listQualityParameters() {
  const { data, error } = await supabase.from(TABLE).select('*').order('part_serial_number')
  if (error) throw error
  return data
}

export async function createQualityParameter(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateQualityParameter(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteQualityParameter(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
