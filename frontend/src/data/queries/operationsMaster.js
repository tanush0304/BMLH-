import { supabase } from '../../lib/supabaseClient'

const TABLE = 'operations master'

export async function listMachineOperationOptions() {
  const { data, error } = await supabase.from(TABLE).select('*').order('operation_name')
  if (error) throw error
  return data.map((r) => r.operation_name)
}

export async function createMachineOperationOption(operationName) {
  const { data, error } = await supabase.from(TABLE).insert({ operation_name: operationName }).select().single()
  if (error) throw error
  return data
}
