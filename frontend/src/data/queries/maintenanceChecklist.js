import { supabase } from '../../lib/supabaseClient'

const TABLE = 'maintenance master'

export async function listMaintenanceChecklist() {
  const { data, error } = await supabase.from(TABLE).select('*').order('machine_id')
  if (error) throw error
  return data
}

export async function createMaintenanceChecklistItem(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateMaintenanceChecklistItem(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteMaintenanceChecklistItem(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
