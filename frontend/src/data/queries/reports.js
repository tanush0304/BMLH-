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
