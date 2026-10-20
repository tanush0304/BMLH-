import { supabase } from '../../lib/supabaseClient'
import { withStagePositions } from '../../utils/stageLabel'

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

/** Adds stage_position (the stage's position in its PRD's route) to report
 * rows that carry stage_id -- labels show "Stage <position>". */
async function withStagePosition(rows) {
  const prds = [...new Set(rows.map((r) => r.prd_no).filter(Boolean))]
  if (!prds.length) return rows
  const stages = await fetchAll(() => supabase.from('production route card stages').select('id, prd_no, seq').in('prd_no', prds))
  const pos = new Map(withStagePositions(stages).map((s) => [s.id, s.position]))
  return rows.map((r) => ({ ...r, stage_position: pos.get(r.stage_id) ?? null }))
}

/** "report production hours" (029) for log_date from..to; optional filters
 * are skipped when blank. */
export async function listProductionHours(args) {
  return withStagePosition(await listProductionHoursRaw(args))
}
function listProductionHoursRaw({ from, to, prdNo, machineId, shiftCode, employeeId }) {
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
// `voidable`: the table has 034's voided_at -- voided rows count in no report.
function ledgerUpTo(table, to, { voidable = false } = {}) {
  return fetchAll(() => {
    let q = supabase.from(table).select('*').lte('transaction_date', to)
    if (voidable) q = q.is('voided_at', null)
    return q.order('id')
  })
}

export const listWipTransactionsUpTo = (to) => ledgerUpTo('wip transactions', to)
export const listFgTransactionsUpTo = (to) => ledgerUpTo('finished goods transactions', to, { voidable: true })
export const listRmTransactionsUpTo = (to) => ledgerUpTo('raw material transactions', to, { voidable: true })

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
  fetchAll(() => supabase.from('customer orders').select('*').gte('po_date', from).lte('po_date', to).order('po_date').order('order_line_id'))

/** "report quality inspections" (029) for log_date from..to; optional filters. */
export async function listQualityInspections(args) {
  return withStagePosition(await listQualityInspectionsRaw(args))
}
function listQualityInspectionsRaw({ from, to, prdNo, machineId, shiftCode, employeeId }) {
  return fetchAll(() => {
    let q = supabase
      .from('report quality inspections')
      .select('*')
      .gte('log_date', from)
      .lte('log_date', to)
      .order('log_date')
      .order('quality_log_id')
    if (prdNo) q = q.eq('prd_no', prdNo)
    if (machineId) q = q.eq('machine_id', machineId)
    if (shiftCode) q = q.eq('shift_code', shiftCode)
    if (employeeId) q = q.eq('employee_id', employeeId)
    return q
  })
}

/** "quality log results" readings for the given quality logs, in batches of
 * 200 ids (keeps the request URL short). */
export async function listReadingsForLogs(logIds) {
  const out = []
  for (let i = 0; i < logIds.length; i += 200) {
    const ids = logIds.slice(i, i + 200)
    out.push(...(await fetchAll(() => supabase.from('quality log results').select('*').in('quality_log_id', ids).order('reading_id'))))
  }
  return out
}

/** "customer complaints" (027) with complaint_date from..to -- the Customer
 * Complaint report (read-only; RLS lets authenticated users select). */
export const listComplaintsForReport = ({ from, to }) =>
  fetchAll(() =>
    supabase
      .from('customer complaints')
      .select('id, complaint_no, complaint_date, customer_id, part_serial_number, defect_problem, severity, status')
      .gte('complaint_date', from)
      .lte('complaint_date', to)
      .order('complaint_date')
      .order('id')
  )
