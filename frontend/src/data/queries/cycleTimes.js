import { supabase } from '../../lib/supabaseClient'

const TABLE = 'cycle time master'

export async function listCycleTimes() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('part_serial_number')
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

/** Cycle Time Master rows for one part (all seqs/machines) -- Machine Entry
 * picks the part + process (seq) row from these via pickCycleTime. */
export async function listCycleTimesForPart(partSerialNumber) {
  if (!partSerialNumber) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('part_serial_number, seq, machine_id, cycle_time_min')
    .eq('part_serial_number', partSerialNumber)
  if (error) throw error
  return data
}
