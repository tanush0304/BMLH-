import { supabase } from '../../lib/supabaseClient'

const TABLE = 'vendors master'

export async function listVendors() {
  const { data, error } = await supabase.from(TABLE).select('*').order('vendor_id')
  if (error) throw error
  return data
}

export async function createVendor(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateVendor(vendorId, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('vendor_id', vendorId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteVendor(vendorId) {
  const { error } = await supabase.from(TABLE).delete().eq('vendor_id', vendorId)
  if (error) throw error
}
