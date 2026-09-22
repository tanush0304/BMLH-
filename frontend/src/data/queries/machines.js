import { supabase } from '../../lib/supabaseClient'

const TABLE = 'machines master'

export async function listMachines() {
  const { data, error } = await supabase.from(TABLE).select('*').order('machine_id')
  if (error) throw error
  return data
}

export async function createMachine(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateMachine(machineId, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('machine_id', machineId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMachine(machineId) {
  const { error } = await supabase.from(TABLE).delete().eq('machine_id', machineId)
  if (error) throw error
}
