import { supabase } from '../../lib/supabaseClient'
import { isMissingTableError } from './deliveryAddresses'

// Migration 045: "customer part numbers" (many per customer, one active per
// customer + our part). Until 045 is run the table is missing, so the app
// hides the Customer Master section and every Customer Part No field /
// column instead of failing. The answer is cached once known; a network
// error is not cached (retried next call). Before 045 the probe shows one
// expected 404 in the browser console.
const TABLE = 'customer part numbers'

let supported = null
let probe = null

export async function customerPartNumbersSupported() {
  if (supported !== null) return supported
  probe ??= (async () => {
    const { error } = await supabase.from(TABLE).select('id').limit(0)
    if (!error) return (supported = true)
    if (isMissingTableError(error)) return (supported = false)
    return false
  })().finally(() => {
    probe = null
  })
  return probe
}

export function resetCustomerPartNumbersSupportedCache() {
  supported = null
  probe = null
}

/** Every row (active + inactive), customer then part. */
export async function listCustomerPartNumbers() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('customer_id')
    .order('part_serial_number')
  if (error) throw error
  return data
}

export async function createCustomerPartNumber(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateCustomerPartNumber(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}
