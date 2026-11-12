// "app settings" (migration 051): key / value pairs, read by every app user,
// changed by the developer in the SQL editor only (no app screen). Before
// 051 the table is missing -> the screens use the defaults (strict hourly
// cap, 0 % tolerance).
import { supabase } from '../../lib/supabaseClient'
import { isMissingTableError } from './deliveryAddresses'

export const HOUR_CAP_KEYS = { mode: 'hour_qty_cap_mode', tolerance: 'hour_qty_cap_tolerance_pct' }

/** { supported, rows: [{ key, value, updated_by, updated_at }] } */
export async function listAppSettings() {
  const { data, error } = await supabase.from('app settings').select('key, value, updated_by, updated_at')
  if (error) {
    if (isMissingTableError(error)) return { supported: false, rows: [] }
    throw error
  }
  return { supported: true, rows: data ?? [] }
}

/** Raw hourly-cap settings { mode, tolerancePct } (strings or undefined);
 * never throws -- a failed read leaves them undefined (= strict, 0). */
export async function getHourCapSettings() {
  try {
    const { rows } = await listAppSettings()
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return { mode: byKey[HOUR_CAP_KEYS.mode], tolerancePct: byKey[HOUR_CAP_KEYS.tolerance] }
  } catch {
    return {}
  }
}
