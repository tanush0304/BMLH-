import { supabase } from '../../lib/supabaseClient'

const TABLE = 'machine operations'

export async function listOperationsForMachine(machineId) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('machine_id', machineId)
  if (error) throw error
  return data
}

/** Replaces the full set of operations for a machine with `operations`. */
export async function setMachineOperations(machineId, operations) {
  const { error: delErr } = await supabase.from(TABLE).delete().eq('machine_id', machineId)
  if (delErr) throw delErr
  if (operations.length === 0) return
  const { error: insErr } = await supabase
    .from(TABLE)
    .insert(operations.map((operation) => ({ machine_id: machineId, operation })))
  if (insErr) throw insErr
}
