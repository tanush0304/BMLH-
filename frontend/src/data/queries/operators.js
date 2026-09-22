import { supabase } from '../../lib/supabaseClient'

const TABLE = 'operators master'

export async function listOperators() {
  const { data, error } = await supabase.from(TABLE).select('*').order('operator_emp_id')
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
    .eq('operator_emp_id', operatorEmpId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteOperator(operatorEmpId) {
  const { error } = await supabase.from(TABLE).delete().eq('operator_emp_id', operatorEmpId)
  if (error) throw error
}
