import { supabase } from '../../lib/supabaseClient'

const TABLE = 'users master'

export async function listOperators() {
  const { data, error } = await supabase.from(TABLE).select('*').order('user_emp_id')
  if (error) throw error
  return data
}

export async function createOperator(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateOperator(operatorEmpId, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('user_emp_id', operatorEmpId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteOperator(operatorEmpId) {
  const { error } = await supabase.from(TABLE).delete().eq('user_emp_id', operatorEmpId)
  if (error) throw error
}
