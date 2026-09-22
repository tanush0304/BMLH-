import { supabase } from '../../lib/supabaseClient'

const TABLE = 'suppliers master'

export async function listSuppliers() {
  const { data, error } = await supabase.from(TABLE).select('*').order('supplier_id')
  if (error) throw error
  return data
}

export async function createSupplier(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateSupplier(supplierId, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('supplier_id', supplierId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSupplier(supplierId) {
  const { error } = await supabase.from(TABLE).delete().eq('supplier_id', supplierId)
  if (error) throw error
}
