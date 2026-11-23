import { supabase } from '../../lib/supabaseClient'
import { isMissingColumnError } from './openPo'
import { isMissingTableError } from './deliveryAddresses'

// Migration 059: "employees master".grade + table "employee private details"
// (supervisor / admin only by RLS). Until 059 is run the Grade field and the
// Personal details card are hidden. Answers cached once known; a network
// error is not cached. Before 059 each probe shows one expected 400 / 404.
//
// PRIVACY: nothing here logs, and errors are re-thrown with code only (the
// screen maps the code to fixed text) -- a check-constraint error's details
// contain the whole row.
const TABLE = 'employee private details'

let gradeSupported = null
let gradeProbe = null
export async function employeeGradeSupported() {
  if (gradeSupported !== null) return gradeSupported
  gradeProbe ??= (async () => {
    const { error } = await supabase.from('employees master').select('grade').limit(0)
    if (!error) return (gradeSupported = true)
    if (isMissingColumnError(error)) return (gradeSupported = false)
    return false
  })().finally(() => { gradeProbe = null })
  return gradeProbe
}

let privateSupported = null
let privateProbe = null
export async function employeePrivateSupported() {
  if (privateSupported !== null) return privateSupported
  privateProbe ??= (async () => {
    const { error } = await supabase.from(TABLE).select('employee_id').limit(0)
    if (!error) return (privateSupported = true)
    if (isMissingTableError(error)) return (privateSupported = false)
    return false
  })().finally(() => { privateProbe = null })
  return privateProbe
}

export function resetEmployeeProbeCache() {
  gradeSupported = null
  gradeProbe = null
  privateSupported = null
  privateProbe = null
}

/** Error with the code only -- never the message / details (they can echo the row). */
function safeError(error) {
  const e = new Error('employee private details request failed')
  e.code = error?.code ?? null
  e.rls = /row-level security/i.test(String(error?.message ?? ''))
  return e
}

/** The employee's private row, or null. */
export async function getEmployeePrivate(employeeId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('employee_id, phone_1, phone_2, address, aadhaar_last4, updated_at, updated_by')
    .eq('employee_id', employeeId)
    .maybeSingle()
  if (error) throw safeError(error)
  return data
}

/** Insert or update the employee's private row (one request). */
export async function saveEmployeePrivate(payload) {
  const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'employee_id' }).select().single()
  if (error) throw safeError(error)
  return data
}
