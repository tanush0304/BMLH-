import { supabase } from '../../lib/supabaseClient'

/**
 * Sequence is no longer enforced (see machineEntry.js's listEligibleStagesForMachine
 * for the same change) -- a stage can be fed via WIP Issue rather than strictly
 * from the stage before it. The lock here is a still-open dispatch: a stage
 * that's already been dispatched but not yet received can't be dispatched a
 * second time (to a different vendor, say) until that receipt lands or the
 * dispatch is otherwise resolved.
 */
export async function listPendingOutsourcedStagesForPrd(prdNo) {
  const { data, error } = await supabase
    .from('production route card stages')
    .select('*')
    .eq('prd_no', prdNo)
    .order('seq')
  if (error) throw error

  const openDispatches = await listDispatchesWithoutReceipt()
  const lockedStageIds = new Set(
    openDispatches.filter((d) => d.prd_no === prdNo).map((d) => d.stage_id)
  )
  return data.filter((s) => s.type === 'Outsourced' && s.status === 'Pending' && !lockedStageIds.has(s.id))
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

/**
 * Recording a receipt also marks the dispatch's route card stage as
 * 'Received' -- without this, an Outsourced stage stays 'Pending' forever
 * (the "job order status" view only derives a display label from
 * dispatch+receipt, it never touches production route card stages), which
 * permanently blocks isStageReachable() for every stage after it.
 */
export async function createReceipt(payload) {
  const { data: dispatch, error: dispatchErr } = await supabase
    .from('job order dispatch')
    .select('stage_id')
    .eq('dc_no', payload.dc_no)
    .single()
  if (dispatchErr) throw dispatchErr

  const { data, error } = await supabase.from('job order receipt').insert(payload).select().single()
  if (error) throw error

  const { error: stageErr } = await supabase
    .from('production route card stages')
    .update({ status: 'Received', actual_date: payload.receipt_date ?? new Date().toISOString().slice(0, 10) })
    .eq('id', dispatch.stage_id)
  if (stageErr) throw stageErr

  return data
}

export async function listJobOrderStatus() {
  const { data, error } = await supabase.from('job order status').select('*').order('dispatch_date', { ascending: false })
  if (error) throw error
  return data
}
