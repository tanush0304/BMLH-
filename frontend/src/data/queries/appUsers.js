import { supabase } from '../../lib/supabaseClient'

const TABLE = 'app users'

export async function getMyAppUser(userId) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function createAppUser(userId, role = 'operator') {
  const { data, error } = await supabase.from(TABLE).insert({ user_id: userId, role }).select().single()
  if (error) throw error
  return data
}

/** Every app user -- only to show who edited a stock transaction. */
export async function listAppUsers() {
  const { data, error } = await supabase.from(TABLE).select('*')
  if (error) throw error
  return data
}
