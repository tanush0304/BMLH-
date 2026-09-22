import { supabase } from '../../lib/supabaseClient'

const TABLE = 'shifts master'

export async function listShifts() {
  const { data, error } = await supabase.from(TABLE).select('*').order('shift_code')
  if (error) throw error
  return data
}

export async function createShift(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateShift(shiftCode, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('shift_code', shiftCode)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteShift(shiftCode) {
  const { error } = await supabase.from(TABLE).delete().eq('shift_code', shiftCode)
  if (error) throw error
}
