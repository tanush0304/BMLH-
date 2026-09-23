import { supabase } from '../../lib/supabaseClient'

const TABLE = 'customer enquiries'

export async function listCustomerEnquiries() {
  const { data, error } = await supabase.from(TABLE).select('*').order('qtn_no')
  if (error) throw error
  return data
}

export async function createCustomerEnquiry(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateCustomerEnquiry(qtnNo, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('qtn_no', qtnNo).select().single()
  if (error) throw error
  return data
}

export async function deleteCustomerEnquiry(qtnNo) {
  const { error } = await supabase.from(TABLE).delete().eq('qtn_no', qtnNo)
  if (error) throw error
}
