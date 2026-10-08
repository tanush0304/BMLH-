import { supabase } from '../../lib/supabaseClient'
import { nextSequenceNo } from '../../utils/numbering'

/**
 * Sequence is no longer enforced -- a stage can be fed via WIP Issue rather
 * than strictly from the stage before it. The lock here is a still-open
 * dispatch: a stage that's already been dispatched but not yet received
 * can't be dispatched a second time (to a different vendor, say) until
 * that receipt lands or the dispatch is otherwise resolved.
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
  return nextSequenceNo('DC', data.map((r) => r.dc_no))
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
 * 'Received' (actual_date = receipt date) and closes the dispatch
 * (is_open = false). All three happen in ONE database transaction inside
 * create_job_order_receipt (migration 019) -- either everything is saved or
 * nothing is. Since migration 021 it also generates the JR-NNN receipt_no
 * and returns it on the row. A second receipt for the same DC still fails on the receipt
 * table's unique (dc_no).
 */
export async function createReceipt(payload) {
  const { data, error } = await supabase.rpc('create_job_order_receipt', {
    p_dc_no: payload.dc_no,
    p_qty_received: payload.qty_received,
    p_receipt_date: payload.receipt_date || null,
  })
  if (error) throw error
  return data
}

/** dc_no -> receipt_no, merged into the Job Order Status list (the view
 * itself doesn't carry receipt_no). dc_no is unique on the receipt table. */
export async function listReceiptNumbers() {
  const { data, error } = await supabase.from('job order receipt').select('dc_no, receipt_no')
  if (error) throw error
  return data
}

export async function listJobOrderStatus() {
  const { data, error } = await supabase.from('job order status').select('*').order('dispatch_date', { ascending: false })
  if (error) throw error
  return data
}
