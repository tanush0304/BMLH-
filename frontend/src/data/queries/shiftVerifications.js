import { supabase } from '../../lib/supabaseClient'

const TABLE = 'production shift verifications'

/** Every verification row for one date + shift (Shift Verification screen). */
export async function listShiftVerificationsForDateShift(logDate, shiftCode) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('log_date', logDate).eq('shift_code', shiftCode)
  if (error) throw error
  return data
}

/** Every verification row of one log, all dates/shifts (Production Data Entry /
 * Manual Operations: lock + "Rejected: <reason>" per shift). */
export async function listShiftVerificationsForLog(logId) {
  if (!logId) return []
  const { data, error } = await supabase.from(TABLE).select('*').eq('log_id', logId)
  if (error) throw error
  return data
}

/** Every hour row worked on one date + shift, any log. */
export async function listHoursForDateShift(logDate, shiftCode) {
  const { data, error } = await supabase
    .from('production log hours')
    .select('*')
    .eq('log_date', logDate)
    .eq('shift_code', shiftCode)
  if (error) throw error
  return data
}

export async function listLogsByIds(ids) {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('production logs').select('*').in('id', ids)
  if (error) throw error
  return data
}

/**
 * Approve / Reject one log + shift (migration 028). Upsert on
 * (log_id, log_date, shift_code): the first decision creates the row. The
 * DB guard checks supervisor/admin and "not your own entries", and stamps
 * verified_by/at or rejected_by/at itself -- nothing is sent for those.
 */
export async function setShiftVerification({ logId, logDate, shiftCode, status, rejectReason = null }) {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        log_id: logId,
        log_date: logDate,
        shift_code: shiftCode,
        status,
        reject_reason: status === 'Rejected' ? rejectReason : null,
      },
      { onConflict: 'log_id,log_date,shift_code' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

/** One hour row of a closed log corrected in Shift Verification (035).
 * `patch` = correctionPatch (editable fields that changed, nothing else);
 * the DB guard checks role / Rejected shift / knock-on / planned qty and
 * stamps edited_by / edited_at / previous_qty_*. Throws the PostgREST error. */
export async function updateHourCorrection(id, patch) {
  const { data, error } = await supabase.from('production log hours').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
