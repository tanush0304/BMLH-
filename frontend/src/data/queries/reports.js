import { supabase } from '../../lib/supabaseClient'

const PAGE = 1000 // PostgREST's default max rows per request

/** Every row of a query, fetched in 1000-row pages. `build` returns a fresh
 * filtered query each call (a builder can only be awaited once). */
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < PAGE) return out
  }
}

/** "report production hours" (029) for log_date from..to; optional filters
 * are skipped when blank. */
export function listProductionHours({ from, to, prdNo, machineId, shiftCode, employeeId }) {
  return fetchAll(() => {
    let q = supabase
      .from('report production hours')
      .select('*')
      .gte('log_date', from)
      .lte('log_date', to)
      .order('log_id')
      .order('log_date')
      .order('shift_code')
      .order('employee_id')
    if (prdNo) q = q.eq('prd_no', prdNo)
    if (machineId) q = q.eq('machine_id', machineId)
    if (shiftCode) q = q.eq('shift_code', shiftCode)
    if (employeeId) q = q.eq('employee_id', employeeId)
    return q
  })
}

/** PRDs that have any production log -- options for the PRD filter. */
export async function listLoggedPrds() {
  const rows = await fetchAll(() => supabase.from('production logs').select('prd_no').order('prd_no'))
  return [...new Set(rows.map((r) => r.prd_no))]
}

/** "report production setup" (029): setting time per log, on the log's own
 * date + shift. Same optional filters as listProductionHours (no operator --
 * setting time belongs to the log, not to an hour row's employee). */
export function listProductionSetup({ from, to, prdNo, machineId, shiftCode }) {
  return fetchAll(() => {
    let q = supabase
      .from('report production setup')
      .select('*')
      .gte('log_date', from)
      .lte('log_date', to)
      .order('log_id')
    if (prdNo) q = q.eq('prd_no', prdNo)
    if (machineId) q = q.eq('machine_id', machineId)
    if (shiftCode) q = q.eq('shift_code', shiftCode)
    return q
  })
}

/** Every ledger row up to `to` (opening needs everything before the period). */
function ledgerUpTo(table, to) {
  return fetchAll(() => supabase.from(table).select('*').lte('transaction_date', to).order('id'))
}

export const listWipTransactionsUpTo = (to) => ledgerUpTo('wip transactions', to)
export const listFgTransactionsUpTo = (to) => ledgerUpTo('finished goods transactions', to)
export const listRmTransactionsUpTo = (to) => ledgerUpTo('raw material transactions', to)

/** "finished goods master" (015): one row per PRD with customer, part, UoM, order qty. */
export const listFgMasterRows = () => fetchAll(() => supabase.from('finished goods master').select('*').order('prd_no'))

/** "raw material stock master" (023): RM x BOM part, with consumption per unit. */
export const listRmStockMasterRows = () => fetchAll(() => supabase.from('raw material stock master').select('*').order('raw_material_code'))

/** Drawing ref per part (FG Inventory). */
export const listPartDrawingRefs = () =>
  fetchAll(() => supabase.from('products master').select('part_serial_number, part_drawing_reference_number').order('part_serial_number'))

/** "job order status" (dispatch + receipt) for dispatch_date from..to. */
export const listJobOrderStatusRows = ({ from, to }) =>
  fetchAll(() => supabase.from('job order status').select('*').gte('dispatch_date', from).lte('dispatch_date', to).order('dispatch_date').order('dc_no'))

/** Customer order lines with PO date from..to. */
export const listOrdersByPoDate = ({ from, to }) =>
  fetchAll(() => supabase.from('customer orders').select('*').gte('po_date', from).lte('po_date', to).order('po_date').order('prd_no'))
