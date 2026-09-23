import { supabase } from '../../lib/supabaseClient'

const TABLE = 'customer orders'

export async function listCustomerOrders() {
  const { data, error } = await supabase.from(TABLE).select('*').order('prd_no')
  if (error) throw error
  return data
}

export async function createCustomerOrder(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateCustomerOrder(prdNo, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('prd_no', prdNo).select().single()
  if (error) throw error
  return data
}

export async function deleteCustomerOrder(prdNo) {
  const { error } = await supabase.from(TABLE).delete().eq('prd_no', prdNo)
  if (error) throw error
}
