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

export async function deleteRawMaterialTransaction(id) {
  const { error } = await supabase.from('raw material transactions').delete().eq('id', id)
  if (error) throw error
}

/** Supervisor/admin edit of an existing row -- `patch` holds only the
 * editable fields (see utils/stockEdit.js). On the three stock tables the
 * migration-025 trigger stamps edited_by/edited_at/previous_qty and refuses
 * changes to the identifying columns. */
export async function updateRawMaterialTransaction(id, patch) {
  const { data, error } = await supabase.from('raw material transactions').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
