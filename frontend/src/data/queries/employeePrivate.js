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

// Migration 060: photo_path column + private bucket "employee-photos".
let photoSupported = null
let photoProbe = null
export async function employeePhotoSupported() {
  if (photoSupported !== null) return photoSupported
  photoProbe ??= (async () => {
    const { error } = await supabase.from(TABLE).select('photo_path').limit(0)
    if (!error) return (photoSupported = true)
    if (isMissingColumnError(error) || isMissingTableError(error)) return (photoSupported = false)
    return false
  })().finally(() => { photoProbe = null })
  return photoProbe
}
export function resetEmployeePhotoCache() {
  photoSupported = null
  photoProbe = null
}

export const PHOTO_BUCKET = 'employee-photos'

/** Storage error -> code-only error (never the message: it can carry the path / URL). */
function safeStorageError(error) {
  const e = new Error('employee photo request failed')
  const status = Number(error?.statusCode ?? error?.status ?? 0)
  const text = String(error?.message ?? '')
  e.code = status === 413 || /too large|exceeded the maximum/i.test(text) ? 'too_large'
    : status === 415 || /mime type|not supported/i.test(text) ? 'bad_type'
      : status === 403 || /row-level security|unauthorized|not authorized/i.test(text) ? 'forbidden'
        : 'storage'
  return e
}

/** Upload the (already resized) JPEG at `path`. */
export async function uploadEmployeePhoto(path, blob) {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw safeStorageError(error)
}

/** Delete a photo file (no-op for a blank path). */
export async function removeEmployeePhotoFile(path) {
  if (!path) return
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
  if (error) throw safeStorageError(error)
}

/** 1-hour signed URL for a photo (kept in component state only, never logged). */
export async function signedEmployeePhotoUrl(path) {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600)
  if (error) throw safeStorageError(error)
  return data?.signedUrl ?? null
}

// Migration 061: aadhaar_number (12 digits). Part B may drop aadhaar_last4,
// so its presence is probed separately -- never select a dropped column.
async function columnProbe(column) {
  const { error } = await supabase.from(TABLE).select(column).limit(0)
  if (!error) return true
  if (isMissingColumnError(error) || isMissingTableError(error)) return false
  return null // unknown (network): not cached
}
let fullSupported = null
let fullProbe = null
export async function employeeAadhaarFullSupported() {
  if (fullSupported !== null) return fullSupported
  fullProbe ??= columnProbe('aadhaar_number').then((v) => (v === null ? false : (fullSupported = v))).finally(() => { fullProbe = null })
  return fullProbe
}
let last4Present = null
let last4Probe = null
export async function employeeAadhaarLast4Present() {
  if (last4Present !== null) return last4Present
  last4Probe ??= columnProbe('aadhaar_last4').then((v) => (v === null ? true : (last4Present = v))).finally(() => { last4Probe = null })
  return last4Probe
}
export function resetEmployeeAadhaarCache() {
  fullSupported = null
  fullProbe = null
  last4Present = null
  last4Probe = null
}

/**
 * The employee's private row, or null. `withPhoto` (060) adds photo_path;
 * `aadhaarMode` 'full' (061) selects aadhaar_number; aadhaar_last4 only while
 * the column exists (`last4Present`).
 */
export async function getEmployeePrivate(employeeId, { withPhoto = false, aadhaarMode = 'last4', last4Present: hasLast4 = true } = {}) {
  const cols = ['employee_id', 'phone_1', 'phone_2', 'address']
  if (hasLast4 && aadhaarMode !== 'full') cols.push('aadhaar_last4')
  if (aadhaarMode === 'full') cols.push('aadhaar_number')
  cols.push('updated_at', 'updated_by')
  if (withPhoto) cols.push('photo_path')
  const { data, error } = await supabase
    .from(TABLE)
    .select(cols.join(', '))
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
