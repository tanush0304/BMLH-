import { supabase } from '../../lib/supabaseClient'

const TABLE = 'employees master'

export async function listEmployees() {
  const { data, error } = await supabase.from(TABLE).select('*').order('employee_id')
  if (error) throw error
  return data
}

export async function createEmployee(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateEmployee(employeeId, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('employee_id', employeeId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEmployee(employeeId) {
  const { error } = await supabase.from(TABLE).delete().eq('employee_id', employeeId)
  if (error) throw error
}
