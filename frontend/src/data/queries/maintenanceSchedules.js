import { supabase } from '../../lib/supabaseClient'

const TABLE = 'maintenance schedule'

export async function listMaintenanceSchedules() {
  const { data, error } = await supabase.from(TABLE).select('*').order('machine_id')
  if (error) throw error
  return data
}

export async function saveMaintenanceSchedule(payload) {
  const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'machine_id' }).select().single()
  if (error) throw error
  return data
}
