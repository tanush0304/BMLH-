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

/**
 * Next DC number is the highest existing "DC-NNN" suffix + 1. Unlike PRD
 * numbers, NONE of the existing dispatches ("DC-001-BR-PRD004",
 * "DC-HPV-BR-01", "DC-HPV-TG-01") match this shape -- there was no
 * consistent DC numbering convention to continue, so this introduces one
 * from scratch starting at DC-001. Existing rows are left exactly as they
 * are and simply ignored when computing the max. dc_no is this table's
 * primary key, so a genuine collision surfaces as a real Postgres 23505.
 */
export async function generateNextDcNo() {
  const { data, error } = await supabase.from('job order dispatch').select('dc_no')
  if (error) throw error
  const maxNum = data.reduce((max, r) => {
    const match = /^DC-(\d+)$/.exec(r.dc_no ?? '')
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `DC-${String(maxNum + 1).padStart(3, '0')}`
}

/**
 * The actual concurrency lock: "job order dispatch" has a partial unique
 * index on stage_id where is_open, so a second dispatch for a stage that
 * already has one open fails at the database with 23505 -- this check is
 * just a courtesy to fail fast with a clear message before hitting that.
 */
export async function createDispatch(payload) {
  const { data, error } = await supabase
    .from('job order dispatch')
    .insert({ ...payload, is_open: true })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('This stage already has an open dispatch. Someone else dispatched it first -- refresh and check Job Order Status.')
    }
    throw error
  }
  return data
}

/** Source of truth is the is_open column (set false by createReceipt below),
 * not an inferred join against receipts. */
export async function listDispatchesWithoutReceipt() {
  const { data, error } = await supabase.from('job order dispatch').select('*').eq('is_open', true)
  if (error) throw error
  return data
}

/**
 * Recording a receipt also marks the dispatch's route card stage as
 * 'Received' -- without this, an Outsourced stage stays 'Pending' forever
 * (the "job order status" view only derives a display label from
 * dispatch+receipt, it never touches production route card stages), which
 * permanently blocks a stage's downstream work. It also flips the
 * dispatch's is_open to false directly, at the point the receipt actually
 * happens -- not inferred from the receipt row's mere existence elsewhere.
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

  const { error: closeErr } = await supabase
    .from('job order dispatch')
    .update({ is_open: false })
    .eq('dc_no', payload.dc_no)
  if (closeErr) throw closeErr

  return data
}

export async function listJobOrderStatus() {
  const { data, error } = await supabase.from('job order status').select('*').order('dispatch_date', { ascending: false })
  if (error) throw error
  return data
}
