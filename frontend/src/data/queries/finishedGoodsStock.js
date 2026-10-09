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

/**
 * order_qty, dispatched_qty, balance_to_dispatch, order_status per PRD --
 * derive-don't-store, same pattern as every other status view in this schema.
 */
export async function listFinishedGoodsOrderStatus() {
  const { data, error } = await supabase.from('finished goods order status').select('*')
  if (error) throw error
  return data
}

export async function deleteFinishedGoodsTransaction(id) {
  const { error } = await supabase.from('finished goods transactions').delete().eq('id', id)
  if (error) throw error
}

/** Supervisor/admin edit of an existing row -- `patch` holds only the
 * editable fields (see utils/stockEdit.js). On the three stock tables the
 * migration-025 trigger stamps edited_by/edited_at/previous_qty and refuses
 * changes to the identifying columns. */
export async function updateFinishedGoodsTransaction(id, patch) {
  const { data, error } = await supabase.from('finished goods transactions').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
