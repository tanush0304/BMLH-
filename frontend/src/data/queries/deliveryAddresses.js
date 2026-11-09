import { supabase } from '../../lib/supabaseClient'

// Migration 042: "customer delivery addresses" (many per customer, one
// default) + "customer orders".delivery_address_id. Until 042 is run the
// table is missing, so the app hides Deliver To / the address section /
// address columns instead of failing. The answer is cached once known; a
// network error is not cached (retried next call). Before 042 the probe
// shows one expected 404 in the browser console.
const TABLE = 'customer delivery addresses'

let supported = null
let probe = null

export function isMissingTableError(error) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.code === 'PGRST200' ||
    /relation .*does not exist|could not find the table/i.test(text)
  )
}

export async function deliveryAddressesSupported() {
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

export function resetDeliveryAddressesSupportedCache() {
  supported = null
  probe = null
}

/** Every address (active + inactive), customer then default first then label. */
export async function listDeliveryAddresses() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('customer_id')
    .order('is_default', { ascending: false })
    .order('label')
  if (error) throw error
  return data
}

export async function createDeliveryAddress(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateDeliveryAddress(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}
