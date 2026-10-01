import { supabase } from '../../lib/supabaseClient'

const TABLE = 'raw material requisitions'

export async function listRequisitions() {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createRequisition(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function listOrderMaterialRequirement() {
  const { data, error } = await supabase.from('order material requirement').select('*')
  if (error) throw error
  return data
}

export async function listOrderMaterialShortfall() {
  const { data, error } = await supabase.from('order material shortfall').select('*')
  if (error) throw error
  return data
}
