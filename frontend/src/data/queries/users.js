import { supabase } from '../../lib/supabaseClient'

const TABLE = 'users master'

export async function listUsers() {
  const { data, error } = await supabase.from(TABLE).select('*').order('user_emp_id')
  if (error) throw error
  return data
}

export async function createUser(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateUser(userEmpId, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('user_emp_id', userEmpId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteUser(userEmpId) {
  const { error } = await supabase.from(TABLE).delete().eq('user_emp_id', userEmpId)
  if (error) throw error
}
