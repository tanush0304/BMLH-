import { supabase } from '../../lib/supabaseClient'

const TABLE = 'job work master'

export async function listJobWorkTypes() {
  const { data, error } = await supabase.from(TABLE).select('*').order('job_work_code')
  if (error) throw error
  return data
}

export async function createJobWorkType(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateJobWorkType(jobWorkCode, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('job_work_code', jobWorkCode)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteJobWorkType(jobWorkCode) {
  const { error } = await supabase.from(TABLE).delete().eq('job_work_code', jobWorkCode)
  if (error) throw error
}
