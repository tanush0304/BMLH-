import { supabase } from '../../lib/supabaseClient'

export async function listLogsForPrd(prdNo) {
  const { data, error } = await supabase.from('production logs').select('*').eq('prd_no', prdNo)
  if (error) throw error
  return data
}

export async function listLogHoursForLogIds(logIds) {
  if (logIds.length === 0) return []
  const { data, error } = await supabase.from('production log hours').select('*').in('log_id', logIds)
  if (error) throw error
  return data
}

export async function listDispatchesForPrd(prdNo) {
  const { data, error } = await supabase.from('job order dispatch').select('*').eq('prd_no', prdNo)
  if (error) throw error
  return data
}

export async function listReceiptsForDcNos(dcNos) {
  if (dcNos.length === 0) return []
  const { data, error } = await supabase.from('job order receipt').select('*').in('dc_no', dcNos)
  if (error) throw error
  return data
}

/**
 * Builds the { output, consumed } aggregate per stage that
 * computeStageAvailability (utils/calculations.js) needs, from the real
 * logged/dispatched/received rows for one PRD.
 */
export async function getStageAggregatesForPrd(prdNo) {
  const [logs, dispatches] = await Promise.all([listLogsForPrd(prdNo), listDispatchesForPrd(prdNo)])
  const logIds = logs.map((l) => l.id)
  const dcNos = dispatches.map((d) => d.dc_no)
  const [logHours, receipts] = await Promise.all([
    listLogHoursForLogIds(logIds),
    listReceiptsForDcNos(dcNos),
  ])

  const aggregates = {}

  for (const log of logs) {
    const bucket = (aggregates[log.stage_id] ??= { output: 0, consumed: 0 })
    bucket.consumed += Number(log.planned_qty ?? 0)
  }
  for (const hour of logHours) {
    const log = logs.find((l) => l.id === hour.log_id)
    if (!log) continue
    const bucket = (aggregates[log.stage_id] ??= { output: 0, consumed: 0 })
    bucket.output += Number(hour.qty_produced ?? 0)
  }
  for (const dispatch of dispatches) {
    const bucket = (aggregates[dispatch.stage_id] ??= { output: 0, consumed: 0 })
    bucket.consumed += Number(dispatch.qty ?? 0)
  }
  for (const receipt of receipts) {
    const dispatch = dispatches.find((d) => d.dc_no === receipt.dc_no)
    if (!dispatch) continue
    const bucket = (aggregates[dispatch.stage_id] ??= { output: 0, consumed: 0 })
    bucket.output += Number(receipt.qty_received ?? 0)
  }

  return aggregates
}

/**
 * A stage's planned_qty is reserved once, when its log is first opened --
 * it does not change on resume. So before opening a new log for a stage,
 * check whether one already exists: if it does, the user picking up
 * that stage in a new session should keep logging hours against it, not
 * open a second log (which would double-reserve the stage's share of the
 * upstream pool). Uses the is_open column directly (set by
 * createProductionLog/closeProductionLog below), not an inference.
 */
export async function getOpenLogForStage(prdNo, stageId) {
  const { data, error } = await supabase
    .from('production logs')
    .select('*')
    .eq('prd_no', prdNo)
    .eq('stage_id', stageId)
    .eq('is_open', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * The actual concurrency lock: "production logs" has a partial unique index
 * on (prd_no, stage_id) where is_open, so a second log for a stage that
 * already has one open fails at the database with 23505 -- getOpenLogForStage
 * above is just a courtesy check to resume instead of even attempting a
 * second insert in the common case; this catch handles the race where two
 * inserts both got past that check.
 */
export async function createProductionLog(payload) {
  const { data, error } = await supabase
    .from('production logs')
    .insert({ ...payload, is_open: true })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('Someone already started this stage. Refresh and resume their session instead.')
    }
    throw error
  }
  return data
}

/** Set explicitly at the point a log is marked complete -- not inferred from
 * the stage's status or from output reaching its target elsewhere. */
export async function closeProductionLog(logId) {
  const { error } = await supabase.from('production logs').update({ is_open: false }).eq('id', logId)
  if (error) throw error
}

export async function addProductionLogHour(payload) {
  const { data, error } = await supabase.from('production log hours').insert(payload).select().single()
  if (error) throw error
  return data
}

/** Bulk-inserts several hour-slot rows at once (the auto-generated shift
 * grid saves only the slots the user actually filled in, in one request). */
export async function addProductionLogHours(rows) {
  if (rows.length === 0) return []
  const { data, error } = await supabase.from('production log hours').insert(rows).select()
  if (error) throw error
  return data
}

export async function getLogTotals(logId) {
  const { data, error } = await supabase
    .from('production log totals')
    .select('*')
    .eq('log_id', logId)
    .maybeSingle()
  if (error) throw error
  return data
}
