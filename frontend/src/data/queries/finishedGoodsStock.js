import { supabase } from '../../lib/supabaseClient'

export async function listFinishedGoodsStockBalance() {
  const { data, error } = await supabase.from('finished goods stock balance').select('*')
  if (error) throw error
  return data
}

export async function listFinishedGoodsTransactions() {
  const { data, error } = await supabase
    .from('finished goods transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function createFinishedGoodsTransaction(payload) {
  const { data, error } = await supabase.from('finished goods transactions').insert(payload).select().single()
  if (error) throw error
  return data
}
