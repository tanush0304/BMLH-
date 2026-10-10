import { supabase } from '../../lib/supabaseClient'

export async function listChecklistItemsForMachine(machineId) {
  const { data, error } = await supabase.from('maintenance master').select('*').eq('machine_id', machineId)
  if (error) throw error
  return data
}

export async function createMaintenanceLog(payload) {
  const { data, error } = await supabase.from('maintenance logs').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function addMaintenanceLogItem(payload) {
  const { data, error } = await supabase.from('maintenance log items').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function listRecentMaintenanceLogs() {
  const { data, error } = await supabase
    .from('maintenance logs')
    .select('*')
    .order('log_date', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

/** Every visit on or after `fromDate` (YYYY-MM-DD) -- for the planning grid. */
export async function listMaintenanceLogsSince(fromDate) {
  const { data, error } = await supabase
    .from('maintenance logs')
    .select('id, machine_id, log_date')
    .gte('log_date', fromDate)
  if (error) throw error
  return data
}
