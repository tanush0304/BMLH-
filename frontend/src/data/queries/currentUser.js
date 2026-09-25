import { supabase } from '../../lib/supabaseClient'

/** The shared store-keeper login's auth user id -- captured automatically,
 * never shown as an editable field, distinct from operator_emp_id (which
 * operator is physically doing the action, picked from a dropdown). */
export async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user?.id ?? null
}
