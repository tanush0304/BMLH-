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

/** The employee's private row, or null. `withPhoto` (060) adds photo_path. */
export async function getEmployeePrivate(employeeId, { withPhoto = false } = {}) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(`employee_id, phone_1, phone_2, address, aadhaar_last4, updated_at, updated_by${withPhoto ? ', photo_path' : ''}`)
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
