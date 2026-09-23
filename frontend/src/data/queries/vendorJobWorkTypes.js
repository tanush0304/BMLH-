import { supabase } from '../../lib/supabaseClient'

const TABLE = 'vendor job work types'

export async function listJobWorkTypesForVendor(vendorId) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('vendor_id', vendorId)
  if (error) throw error
  return data
}

/** Replaces the full set of job work types for a vendor with `jobWorkCodes`. */
export async function setVendorJobWorkTypes(vendorId, jobWorkCodes) {
  const { error: delErr } = await supabase.from(TABLE).delete().eq('vendor_id', vendorId)
  if (delErr) throw delErr
  if (jobWorkCodes.length === 0) return
  const { error: insErr } = await supabase
    .from(TABLE)
    .insert(jobWorkCodes.map((job_work_code) => ({ vendor_id: vendorId, job_work_code })))
  if (insErr) throw insErr
}
