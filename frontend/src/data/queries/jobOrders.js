import { supabase } from '../../lib/supabaseClient'

export async function listPendingOutsourcedStagesForPrd(prdNo) {
  const { data, error } = await supabase
    .from('production route card stages')
    .select('*')
    .eq('prd_no', prdNo)
    .eq('type', 'Outsourced')
    .eq('status', 'Pending')
    .order('seq')
  if (error) throw error
  return data
}

export async function listVendorsForJobWorkCode(jobWorkCode) {
  const { data, error } = await supabase
    .from('vendor job work types')
    .select('vendor_id')
    .eq('job_work_code', jobWorkCode)
  if (error) throw error
  return data.map((r) => r.vendor_id)
}

export async function listDispatches() {
  const { data, error } = await supabase
    .from('job order dispatch')
    .select('*')
    .order('dispatch_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createDispatch(payload) {
  const { data, error } = await supabase.from('job order dispatch').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function listDispatchesWithoutReceipt() {
  const [{ data: dispatches, error: dErr }, { data: receipts, error: rErr }] = await Promise.all([
    supabase.from('job order dispatch').select('*'),
    supabase.from('job order receipt').select('dc_no'),
  ])
  if (dErr) throw dErr
  if (rErr) throw rErr
  const receivedDcNos = new Set(receipts.map((r) => r.dc_no))
  return dispatches.filter((d) => !receivedDcNos.has(d.dc_no))
}

export async function createReceipt(payload) {
  const { data, error } = await supabase.from('job order receipt').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function listJobOrderStatus() {
  const { data, error } = await supabase.from('job order status').select('*').order('dispatch_date', { ascending: false })
  if (error) throw error
  return data
}
