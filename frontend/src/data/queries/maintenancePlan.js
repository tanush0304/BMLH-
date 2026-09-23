import { supabase } from '../../lib/supabaseClient'

export async function listMaintenancePlanStatus() {
  const { data, error } = await supabase.from('maintenance plan status').select('*')
  if (error) throw error
  return data
}

export async function scheduleMaintenanceWeek(machineId, weekStartDate) {
  const { data, error } = await supabase
    .from('maintenance plan')
    .insert({ machine_id: machineId, planned_week_start_date: weekStartDate })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function unscheduleMaintenanceWeek(planId) {
  const { error } = await supabase.from('maintenance plan').delete().eq('id', planId)
  if (error) throw error
}
