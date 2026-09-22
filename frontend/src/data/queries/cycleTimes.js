import { supabase } from '../../lib/supabaseClient'

const TABLE = 'cycle time master'

export async function listCycleTimes() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('product_code')
    .order('seq')
  if (error) throw error
  return data
}

export async function createCycleTime(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateCycleTime(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteCycleTime(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
