import { supabase } from '../../lib/supabaseClient'

const TABLE = 'customers master'

export async function listCustomers() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('customer_id', { ascending: true })
  if (error) throw error
  return data
}

export async function createCustomer(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateCustomer(customerId, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('customer_id', customerId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCustomer(customerId) {
  const { error } = await supabase.from(TABLE).delete().eq('customer_id', customerId)
  if (error) throw error
}
