import { supabase } from '../../lib/supabaseClient'

const TABLE = 'customer orders'

export async function listCustomerOrders() {
  const { data, error } = await supabase.from(TABLE).select('*').order('prd_no')
  if (error) throw error
  return data
}

export async function createCustomerOrder(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

/**
 * Next PRD number is the highest existing "PRD-NNN" suffix + 1 -- rows that
 * don't match that shape (PRD-HPV-A, PRD-HPV-B, from a pilot order predating
 * this auto-numbering) are ignored for the max, not renamed or treated as
 * errors. prd_no is this table's primary key, so a genuine collision
 * surfaces as a real Postgres 23505, same reasoning as QTN numbers.
 */
export async function generateNextPrdNo() {
  const { data, error } = await supabase.from(TABLE).select('prd_no')
  if (error) throw error
  const maxNum = data.reduce((max, r) => {
    const match = /^PRD-(\d+)$/.exec(r.prd_no ?? '')
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `PRD-${String(maxNum + 1).padStart(3, '0')}`
}

export async function updateCustomerOrder(prdNo, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('prd_no', prdNo).select().single()
  if (error) throw error
  return data
}

export async function deleteCustomerOrder(prdNo) {
  const { error } = await supabase.from(TABLE).delete().eq('prd_no', prdNo)
  if (error) throw error
}
