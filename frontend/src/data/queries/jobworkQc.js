// Incoming quality inspection of jobwork receipts.
//   054: "quality logs".receipt_id + machine_id nullable, "quality master".job_work_code
//   055: the gate -- "app settings" keys, "jobwork qc overrides", DB triggers
// Each is probed on its own and cached once known (a network error is not
// cached). Before a migration its probe shows one expected 400 / 404 in the
// browser console and the feature stays hidden.
import { supabase } from '../../lib/supabaseClient'
import { isMissingColumnError } from './openPo'
import { isMissingTableError } from './deliveryAddresses'
import { listAppSettings } from './appSettings'
import { withStagePositions } from '../../utils/stageLabel'
import { qcGateSettings } from '../../utils/jobworkQc'

function cachedProbe(run) {
  let known = null
  let pending = null
  const probe = async () => {
    if (known !== null) return known
    pending ??= (async () => {
      let result
      try {
        result = await run()
      } catch {
        return false
      }
      if (result !== null) known = result
      return result ?? false
    })().finally(() => {
      pending = null
    })
    return pending
  }
  probe.reset = () => {
    known = null
    pending = null
  }
  return probe
}

/** 054: receipt inspections + Job Work Quality Master rows. */
export const qualityReceiptSupported = cachedProbe(async () => {
  const { error } = await supabase.from('quality logs').select('receipt_id').limit(0)
  if (!error) return true
  return isMissingColumnError(error) ? false : null
})

/** 055: the gate (overrides table). */
export const jobworkQcGateSupported = cachedProbe(async () => {
  const { error } = await supabase.from('jobwork qc overrides').select('id').limit(0)
  if (!error) return true
  return isMissingTableError(error) ? false : null
})

export function resetJobworkQcCaches() {
  qualityReceiptSupported.reset()
  jobworkQcGateSupported.reset()
}

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * Everything qcBlockers / pendingIncomingQc need: { settings, stages,
 * dispatches, receipts, qcLogs, overrides }. prdNo narrows it to one PRD
 * (the gate); none = every PRD (the Quality panel + bell).
 */
export async function loadQcGateData({ prdNo } = {}) {
  const { rows: settingRows } = await listAppSettings()
  const settings = qcGateSettings(settingRows)
  const empty = { settings, stages: [], dispatches: [], receipts: [], qcLogs: [], overrides: [] }
  if (!settings.on) return empty

  let stageQ = supabase.from('production route card stages').select('id, prd_no, seq, operation, type, job_work_code')
  let dcQ = supabase.from('job order dispatch').select('dc_no, prd_no, stage_id, qty, voided_at, vendor_id')
  if (prdNo) {
    stageQ = stageQ.eq('prd_no', prdNo)
    dcQ = dcQ.eq('prd_no', prdNo)
  }
  const [stages, dispatches] = await Promise.all([rows(stageQ), rows(dcQ)])
  const dcNos = dispatches.map((d) => d.dc_no)
  if (!dcNos.length) return { ...empty, stages: withStagePositions(stages), dispatches }

  const receipts = await rows(
    supabase.from('job order receipt').select('id, dc_no, receipt_no, qty_received, receipt_date, created_at').in('dc_no', dcNos),
  )
  const receiptIds = receipts.map((r) => r.id)
  if (!receiptIds.length) return { ...empty, stages: withStagePositions(stages), dispatches }

  const [logs, overrides] = await Promise.all([
    rows(supabase.from('quality logs').select('id, receipt_id, log_date').in('receipt_id', receiptIds)),
    rows(supabase.from('jobwork qc overrides').select('*').in('receipt_id', receiptIds)),
  ])
  const results = logs.length
    ? await rows(supabase.from('report quality inspections').select('quality_log_id, inspection_result').in('quality_log_id', logs.map((l) => l.id)))
    : []
  const resultById = new Map(results.map((r) => [r.quality_log_id, r.inspection_result]))
  const qcLogs = logs.map((l) => ({ ...l, inspection_result: resultById.get(l.id) ?? 'No readings' }))
  return { settings, stages: withStagePositions(stages), dispatches, receipts, qcLogs, overrides }
}

/** Supervisor / admin override of one receipt (055 stamps who / when). */
export async function createQcOverride({ receiptId, reason }) {
  const { data, error } = await supabase
    .from('jobwork qc overrides')
    .insert({ receipt_id: receiptId, reason })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Override history of the given receipts, newest first. */
export async function listQcOverrides(receiptIds = []) {
  if (!receiptIds.length) return []
  return rows(
    supabase.from('jobwork qc overrides').select('*').in('receipt_id', receiptIds).order('overridden_at', { ascending: false }),
  )
}

/** Receipts of a PRD's jobwork stages for Quality Inspection's incoming mode:
 * [{ id, receipt_no, dc_no, qty_received, receipt_date, stage_id, prd_no }],
 * non-void DCs only. */
export async function listReceiptsForPrd(prdNo) {
  if (!prdNo) return []
  const dcs = await rows(supabase.from('job order dispatch').select('dc_no, prd_no, stage_id, voided_at').eq('prd_no', prdNo))
  const live = dcs.filter((d) => !d.voided_at)
  if (!live.length) return []
  const byDc = new Map(live.map((d) => [d.dc_no, d]))
  const receipts = await rows(
    supabase.from('job order receipt').select('id, dc_no, receipt_no, qty_received, receipt_date').in('dc_no', [...byDc.keys()]),
  )
  return receipts
    .map((r) => ({ ...r, stage_id: byDc.get(r.dc_no).stage_id, prd_no: prdNo }))
    .sort((a, b) => String(a.receipt_no).localeCompare(String(b.receipt_no), undefined, { numeric: true }))
}

/** One receipt by id (Open from the panel / bell). */
export async function getReceiptWithDc(receiptId) {
  const [receipt] = await rows(
    supabase.from('job order receipt').select('id, dc_no, receipt_no, qty_received, receipt_date').eq('id', receiptId).limit(1),
  )
  if (!receipt) return null
  const [dc] = await rows(supabase.from('job order dispatch').select('dc_no, prd_no, stage_id').eq('dc_no', receipt.dc_no).limit(1))
  return dc ? { ...receipt, prd_no: dc.prd_no, stage_id: dc.stage_id } : null
}
