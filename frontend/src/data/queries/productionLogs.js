import { supabase } from '../../lib/supabaseClient'
import { acceptedFromHour } from '../../utils/qtyLimits'
import { stageNumber } from '../../utils/stageLabel'
import { isMachineBusyError, machineBusyMessage, SAME_STAGE_MESSAGE } from '../../utils/productionLogConflict'

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
  // Voided DCs (034) count nowhere -- not in stage availability either.
  const { data, error } = await supabase.from('job order dispatch').select('*').eq('prd_no', prdNo).is('voided_at', null)
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
    const bucket = (aggregates[log.stage_id] ??= { output: 0, accepted: 0, consumed: 0 })
    bucket.consumed += Number(log.planned_qty ?? 0)
  }
  for (const hour of logHours) {
    const log = logs.find((l) => l.id === hour.log_id)
    if (!log) continue
    const bucket = (aggregates[log.stage_id] ??= { output: 0, accepted: 0, consumed: 0 })
    bucket.output += Number(hour.qty_produced ?? 0)
    // Only good pieces move on to the next stage / WIP / FG.
    bucket.accepted += acceptedFromHour(hour)
  }
  for (const dispatch of dispatches) {
    const bucket = (aggregates[dispatch.stage_id] ??= { output: 0, accepted: 0, consumed: 0 })
    bucket.consumed += Number(dispatch.qty ?? 0)
  }
  for (const receipt of receipts) {
    const dispatch = dispatches.find((d) => d.dc_no === receipt.dc_no)
    if (!dispatch) continue
    const bucket = (aggregates[dispatch.stage_id] ??= { output: 0, accepted: 0, consumed: 0 })
    bucket.output += Number(receipt.qty_received ?? 0)
    bucket.accepted += Number(receipt.qty_received ?? 0)
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
 * inserts both got past that check. A 23505 on the one-open-log-per-machine
 * index (migration 024) gets its own message naming the log holding the machine.
 */
export async function createProductionLog(payload) {
  const { data, error } = await supabase
    .from('production logs')
    .insert({ ...payload, is_open: true })
    .select()
    .single()
  if (error) {
    if (isMachineBusyError(error)) {
      throw new Error(await describeOpenLogOnMachine(payload.machine_id))
    }
    if (error.code === '23505') {
      throw new Error(SAME_STAGE_MESSAGE)
    }
    throw error
  }
  return data
}

/** Builds the "machine busy" message from whatever open log holds the
 * machine (migration 024's one-open-log-per-machine index). Lookups that
 * fail just leave that part out of the message. */
async function describeOpenLogOnMachine(machineId) {
  const [{ data: openLog }, { data: machine }] = await Promise.all([
    supabase.from('production logs').select('prd_no, stage_id').eq('machine_id', machineId).eq('is_open', true).limit(1).maybeSingle(),
    supabase.from('machines master').select('machine_name').eq('machine_id', machineId).maybeSingle(),
  ])
  let stage = null
  if (openLog?.stage_id) {
    const { data } = await supabase
      .from('production route card stages')
      .select('id, prd_no, seq, operation')
      .eq('prd_no', openLog.prd_no)
    const own = (data ?? []).find((s) => s.id === openLog.stage_id) ?? null
    stage = own ? { ...own, position: stageNumber(own, data) } : null
  }
  return machineBusyMessage({ machine, machineId, openLog, stage })
}

/** Set explicitly at the point a log is marked complete -- not inferred from
 * the stage's status or from output reaching its target elsewhere. */
export async function closeProductionLog(logId) {
  const { error } = await supabase.from('production logs').update({ is_open: false }).eq('id', logId)
  if (error) throw error
}

/**
 * "End Log": close an open log WITHOUT completing its stage, so the operator
 * can switch to another operation and come back later. planned_qty is what
 * the log reserved from the upstream pool when it started; it is cut back to
 * what this log actually produced (usedQty, see releasedPlannedQty) so the
 * unused part goes back to the pool and a later log for the same stage can
 * start with it. Stage status is untouched (stays Pending).
 */
export async function endProductionLog(logId, usedQty) {
  const { data, error } = await supabase
    .from('production logs')
    .update({ is_open: false, planned_qty: usedQty })
    .eq('id', logId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Open logs started by this login (user_id, migration 024), newest first --
 * used to reload the operator's log automatically when the screen reopens. */
export async function listOpenLogsForUser(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('production logs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_open', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
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

/** Corrects already-saved hour rows (a shift that is not Approved -- the DB
 * lock from migration 028 refuses rows of an approved shift). One request
 * per row; only the changed fields are sent. */
export async function updateProductionLogHours(changes) {
  return Promise.all(
    changes.map(async ({ id, ...fields }) => {
      const { data, error } = await supabase.from('production log hours').update(fields).eq('id', id).select().single()
      if (error) throw error
      return data
    })
  )
}

/** Every open log (any user) -- machine busy labels on the Machine dropdown.
 * RLS "authenticated full access" lets operators read them. */
export async function listAllOpenLogs() {
  const { data, error } = await supabase
    .from('production logs')
    .select('id, prd_no, stage_id, machine_id')
    .eq('is_open', true)
  if (error) throw error
  return data
}
