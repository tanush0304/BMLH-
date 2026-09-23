import { supabase } from '../../lib/supabaseClient'

export async function listRawMaterialStockBalance() {
  const { data, error } = await supabase.from('raw material stock balance').select('*')
  if (error) throw error
  return data
}

export async function listRawMaterialTransactions() {
  const { data, error } = await supabase
    .from('raw material transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function createRawMaterialTransaction(payload) {
  const { data, error } = await supabase.from('raw material transactions').insert(payload).select().single()
  if (error) throw error
  return data
}
