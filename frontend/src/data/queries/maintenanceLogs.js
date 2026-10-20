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
  // "Edited" badge: the latest edit of the visit header OR any of its items
  // (032). '*' so the list still loads before 032 adds the columns.
  const ids = data.map((l) => l.id)
  const { data: items, error: itemErr } = await supabase
    .from('maintenance log items')
    .select('*')
    .in('maintenance_log_id', ids.length ? ids : [-1])
  if (itemErr) throw itemErr
  const latestItemEdit = new Map()
  for (const it of items) {
    if (!it.edited_at) continue
    const cur = latestItemEdit.get(it.maintenance_log_id)
    if (!cur || String(it.edited_at) > String(cur.edited_at)) latestItemEdit.set(it.maintenance_log_id, it)
  }
  return data.map((l) => {
    const it = latestItemEdit.get(l.id)
    if (!it || (l.edited_at && String(l.edited_at) >= String(it.edited_at))) return l
    return { ...l, edited_by: it.edited_by, edited_at: it.edited_at }
  })
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

// Supervisor/admin edit (032): visit header and its saved checklist items.
export async function listMaintenanceLogItems(logId) {
  const { data, error } = await supabase.from('maintenance log items').select('*').eq('maintenance_log_id', logId)
  if (error) throw error
  return data
}

export async function updateMaintenanceLog(id, patch) {
  const { error } = await supabase.from('maintenance logs').update(patch).eq('id', id)
  if (error) throw error
}

export async function updateMaintenanceLogItem(id, patch) {
  const { error } = await supabase.from('maintenance log items').update(patch).eq('id', id)
  if (error) throw error
}
