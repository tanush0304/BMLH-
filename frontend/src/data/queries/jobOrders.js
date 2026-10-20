import { supabase } from '../../lib/supabaseClient'
import { withStagePositions } from '../../utils/stageLabel'
import { nextSequenceNo } from '../../utils/numbering'

/**
 * Outsourced stages of a PRD that can still be dispatched (status Pending).
 * Since migration 031 a stage may have several open DCs at once (split
 * across vendors); the database limits the total dispatched to the stage's
 * available qty (trg_job_order_dispatch_insert_guard).
 */
export async function listPendingOutsourcedStagesForPrd(prdNo) {
  const { data, error } = await supabase
    .from('production route card stages')
    .select('*')
    .eq('prd_no', prdNo)
    .order('seq')
  if (error) throw error
  // Positions over the whole route, then filtered (stage picker shows "Stage N").
  return withStagePositions(data).filter((s) => s.type === 'Outsourced' && s.status === 'Pending')
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

/** New DC. The database checks it (031): stage Outsourced + Pending and
 * qty <= what the stage still has to send -- its message is shown as is. */
export async function createDispatch(payload) {
  const { data, error } = await supabase
    .from('job order dispatch')
    .insert({ ...payload, is_open: true })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('That DC number was just used by someone else -- save again for the next number.')
    }
    throw error
  }
  return data
}

/**
 * One receipt against a DC (a DC can have several since migration 031).
 * create_job_order_receipt numbers it JR-NNN, checks DC open / qty > 0 /
 * qty <= balance (trigger), closes the DC once fully received and then lets
 * refresh_outsourced_stage decide whether the stage is Received -- all in one
 * transaction.
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

/** Close an open DC short (supervisor/admin, reason required; allowed with
 * nothing received). The stage completion check runs in the same call. */
export async function closeDispatchShort(dcNo, reason) {
  const { data, error } = await supabase.rpc('close_job_order_short', { p_dc_no: dcNo, p_reason: reason })
  if (error) throw error
  return data
}

/** Every receipt row (one per JR number), newest first. */
export async function listReceipts() {
  const { data, error } = await supabase
    .from('job order receipt')
    .select('*')
    .order('receipt_date', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data
}

/** "jobwork stage status" (031): one row per Outsourced stage -- sent /
 * received / short qty, remaining to dispatch and the stage status
 * (Not Sent / Sent / Partially Received / Received). */
export async function listJobworkStageStatus(prdNo) {
  let q = supabase.from('jobwork stage status').select('*').order('prd_no').order('seq')
  if (prdNo) q = q.eq('prd_no', prdNo)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function listJobOrderStatus() {
  const { data, error } = await supabase.from('job order status').select('*').order('dispatch_date', { ascending: false })
  if (error) throw error
  return data
}

/** Supervisor/admin edit of an open DC (033). `patch` = dispatchEditPatch
 * (qty, dispatch_date, vendor_id only); the DB checks the limits, recomputes
 * expected_receipt_date, closes the DC when qty = received and stamps
 * edited_by / edited_at / previous_qty. Throws the PostgREST error (code kept). */
export async function updateDispatch(dcNo, patch) {
  const { data, error } = await supabase.from('job order dispatch').update(patch).eq('dc_no', dcNo).select().single()
  if (error) throw error
  return data
}

/** Supervisor/admin edit of a receipt on an open DC (033). `patch` =
 * receiptEditPatch (qty_received, receipt_date only -- the only columns
 * granted). The DC closes when the edit makes it fully received. */
export async function updateReceipt(id, patch) {
  const { data, error } = await supabase.from('job order receipt').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
