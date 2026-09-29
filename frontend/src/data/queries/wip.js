import { supabase } from '../../lib/supabaseClient'

const TABLE = 'wip transactions'
const BALANCE_VIEW = 'wip stock balance'

/** All WIP transactions for a PRD, split into per-stage aggregates that
 * computeStageAvailability's carry-forward formula needs:
 * - receiptedFrom[stageId]: how much of that stage's output was pulled OUT
 *   into WIP holding (no longer flowing straight downstream).
 * - issuedTo[stageId]: how much has been pulled FROM WIP holding INTO that
 *   stage (on top of whatever's flowing to it directly).
 */
export async function getWipAggregatesForPrd(prdNo) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('prd_no', prdNo)
  if (error) throw error

  const receiptedFrom = {}
  const issuedTo = {}
  for (const t of data) {
    const qty = Number(t.qty ?? 0)
    if (t.transaction_type === 'Receipt') {
      receiptedFrom[t.nature_of_operation_stage_id] = (receiptedFrom[t.nature_of_operation_stage_id] ?? 0) + qty
    } else if (t.transaction_type === 'Issue') {
      issuedTo[t.target_stage_id] = (issuedTo[t.target_stage_id] ?? 0) + qty
    }
  }
  return { receiptedFrom, issuedTo }
}

export async function listWipBalanceForPrd(prdNo) {
  const { data, error } = await supabase.from(BALANCE_VIEW).select('*').eq('prd_no', prdNo)
  if (error) throw error
  return data
}

export async function listWipBalances() {
  const { data, error } = await supabase.from(BALANCE_VIEW).select('*')
  if (error) throw error
  return data
}

export async function createWipReceipt(payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, transaction_type: 'Receipt' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createWipIssue(payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, transaction_type: 'Issue' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listWipTransactionsForPrd(prdNo) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('prd_no', prdNo)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
