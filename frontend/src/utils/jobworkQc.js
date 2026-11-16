// Quality gate after jobwork (migrations 054 + 055). JS twin of 055's
// jobwork_qc_receipt_blockers / jobwork_qc_blockers -- change both together.
//
// Rule (per receipt): every receipt (JR) of a non-void DC of an outsourced
// stage needs its own inspection ("quality logs".receipt_id) whose LATEST
// result (log_date, then id) is Accepted, or a supervisor override. Receipts
// created before jobwork_qc_gate_from are grandfathered. Gate off (mode not
// 'on') -> nothing blocks. The stage checked is the one right before the
// target: every Outsourced stage at the highest seq below the target's seq.
// WIP Issue also checks its source stage when that is a jobwork stage further
// back than the target's previous stage.

import { ddmmyyyy } from './alerts'

export const QC_GATE_KEYS = { mode: 'jobwork_qc_gate_mode', from: 'jobwork_qc_gate_from' }

/** { on, from } from "app settings" rows. Missing / not 'on' -> off;
 * unreadable from -> null (every receipt checked), as in 055. */
export function qcGateSettings(rows = []) {
  const byKey = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]))
  const t = Date.parse(String(byKey[QC_GATE_KEYS.from] ?? '').replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))
  return { on: byKey[QC_GATE_KEYS.mode] === 'on', from: Number.isFinite(t) ? t : null }
}

const num = (v) => Number(v)

/** Position shown on screen = distinct seqs of the PRD up to the stage (055 v_label). */
export function stagePositionOf(stage, stages = []) {
  if (!stage) return null
  return new Set(stages.filter((s) => s.prd_no === stage.prd_no && num(s.seq) <= num(stage.seq)).map((s) => num(s.seq))).size
}

/** Every Outsourced stage right before `target` (highest seq below it). */
export function previousJobworkStages(target, stages = []) {
  if (!target) return []
  const before = stages.filter((s) => s.prd_no === target.prd_no && num(s.seq) < num(target.seq))
  if (!before.length) return []
  const prev = Math.max(...before.map((s) => num(s.seq)))
  return before.filter((s) => num(s.seq) === prev && s.type === 'Outsourced').sort((a, b) => num(a.id) - num(b.id))
}

/** Latest inspection of a receipt: qcLogs rows { id, receipt_id, log_date, inspection_result }. */
export function latestInspection(receiptId, qcLogs = []) {
  return qcLogs
    .filter((q) => String(q.receipt_id) === String(receiptId))
    .sort((a, b) => String(b.log_date ?? '').localeCompare(String(a.log_date ?? '')) || num(b.id) - num(a.id))[0] ?? null
}

/** 'passed' | 'overridden' | 'rejected' | 'pending' (no inspection, or 'No readings'). */
export function receiptQcState(receipt, { qcLogs = [], overrides = [] } = {}) {
  if (overrides.some((o) => String(o.receipt_id) === String(receipt.id))) return 'overridden'
  const last = latestInspection(receipt.id, qcLogs)
  if (last?.inspection_result === 'Accepted') return 'passed'
  if (last?.inspection_result === 'Rejected') return 'rejected'
  return 'pending'
}

const receiptCreated = (r) => Date.parse(r.created_at ?? '')

/** Receipts of a jobwork stage the gate checks: non-void DCs, created at / after `from`. */
export function gatedReceipts(stageId, { dispatches = [], receipts = [], from = null } = {}) {
  const dcs = new Map(
    dispatches.filter((d) => String(d.stage_id) === String(stageId) && !d.voided_at).map((d) => [d.dc_no, d]),
  )
  return receipts
    .filter((r) => dcs.has(r.dc_no))
    .filter((r) => from == null || !(receiptCreated(r) < from))
    .sort((a, b) => String(a.receipt_date ?? '').localeCompare(String(b.receipt_date ?? '')) || num(a.id) - num(b.id))
    .map((r) => ({ ...r, dc: dcs.get(r.dc_no) }))
}

/** The 055 message for one blocking receipt. */
export function qcBlockMessage({ prdNo, operation, dcNo, receiptNo, receiptDate, state, inspectedOn, targetLabel }) {
  const head = `${prdNo}: ${operation} (${dcNo}, ${receiptNo})`
  const target = targetLabel || 'the next stage'
  if (state === 'rejected') {
    return `${head} received on ${ddmmyyyy(receiptDate)} was Rejected at inspection on ${ddmmyyyy(inspectedOn)}. Ask Quality to re-inspect it, or a supervisor to override, before starting ${target}.`
  }
  return `${head} was received on ${ddmmyyyy(receiptDate)} but has no quality inspection yet. Ask Quality to inspect it before starting ${target}.`
}

/** Blocking receipts of one jobwork stage for `target`. */
export function receiptBlockers(jobworkStage, target, data) {
  const { settings = { on: false, from: null }, stages = [], qcLogs = [], overrides = [] } = data
  if (!settings.on || !jobworkStage || jobworkStage.type !== 'Outsourced') return []
  const targetLabel = target ? `Stage ${stagePositionOf(target, stages)}` : 'the next stage'
  return gatedReceipts(jobworkStage.id, { ...data, from: settings.from }).flatMap((r) => {
    const state = receiptQcState(r, { qcLogs, overrides })
    if (state === 'passed' || state === 'overridden') return []
    const last = latestInspection(r.id, qcLogs)
    const item = {
      receipt_id: r.id,
      receipt_no: r.receipt_no,
      dc_no: r.dc_no,
      prd_no: jobworkStage.prd_no,
      stage_id: jobworkStage.id,
      operation: jobworkStage.operation,
      receipt_date: r.receipt_date,
      qty_received: r.qty_received,
      state,
      inspected_on: state === 'rejected' ? last?.log_date ?? null : null,
    }
    return [{
      ...item,
      message: qcBlockMessage({
        prdNo: item.prd_no, operation: item.operation, dcNo: item.dc_no, receiptNo: item.receipt_no,
        receiptDate: item.receipt_date, state, inspectedOn: item.inspected_on, targetLabel,
      }),
    }]
  })
}

/**
 * Blockers for starting `targetStageId` (Data Entry / Manual Ops log, a DC for
 * that stage, or a WIP Issue into it -- pass sourceStageId for WIP).
 * data = { settings, stages, dispatches, receipts, qcLogs, overrides }.
 */
export function qcBlockers({ targetStageId, sourceStageId = null }, data) {
  const stages = data.stages ?? []
  const target = stages.find((s) => String(s.id) === String(targetStageId))
  if (!target) return []
  const prevStages = previousJobworkStages(target, stages)
  const out = prevStages.flatMap((s) => receiptBlockers(s, target, data))
  if (sourceStageId != null) {
    const source = stages.find((s) => String(s.id) === String(sourceStageId))
    const before = stages.filter((s) => s.prd_no === target.prd_no && num(s.seq) < num(target.seq))
    const prevSeq = before.length ? Math.max(...before.map((s) => num(s.seq))) : null
    if (source && num(source.seq) !== prevSeq) out.push(...receiptBlockers(source, target, data))
  }
  return out
}

/** Every receipt waiting for incoming QC (pending or rejected), oldest first:
 * the Quality panel + the bell. */
export function pendingIncomingQc(data) {
  const { settings = { on: false }, stages = [] } = data
  if (!settings.on) return []
  return stages
    .filter((s) => s.type === 'Outsourced')
    .flatMap((s) => {
      const next = stages
        .filter((x) => x.prd_no === s.prd_no && num(x.seq) > num(s.seq))
        .sort((a, b) => num(a.seq) - num(b.seq) || num(a.id) - num(b.id))[0]
      return receiptBlockers(s, next ?? null, data)
    })
    .sort((a, b) => String(a.receipt_date ?? '').localeCompare(String(b.receipt_date ?? '')) || num(a.receipt_id) - num(b.receipt_id))
}

/** Bell / panel text: "PRD-012 · Toughening · DC-008 / JR-008 · 411 pcs received 15-11-2026 -- no inspection yet". */
export function pendingQcText(item) {
  const status = item.state === 'rejected' ? `Rejected on ${ddmmyyyy(item.inspected_on)}` : 'no inspection yet'
  return `${item.prd_no} · ${item.operation} · ${item.dc_no} / ${item.receipt_no} · ${item.qty_received} pcs received ${ddmmyyyy(item.receipt_date)} -- ${status}`
}

/** Bell items (supervisor / admin): Open -> Quality Inspection with the receipt. */
export function pendingIncomingQcItems(data) {
  return pendingIncomingQc(data).map((item) => ({
    id: `qc:${item.receipt_id}`,
    text: pendingQcText(item),
    open: { topKey: 'quality', subKey: 'inspection', mode: qcMode(item.receipt_id) },
  }))
}

/** Quality Inspection open mode for a receipt ("qc:12"), and back. */
export const qcMode = (receiptId) => `qc:${receiptId}`
export function receiptFromMode(mode) {
  if (typeof mode !== 'string' || !mode.startsWith('qc:')) return null
  const n = Number(mode.slice(3))
  return Number.isFinite(n) ? n : null
}

/** Display of a quality log's machine. After 054 a log has a machine OR a
 * receipt (check constraint), so no machine = an incoming jobwork inspection. */
export const JOBWORK_MACHINE_LABEL = 'Jobwork'
export function qualityMachineText(row, machineText = (r) => r.machine_id) {
  if (!row) return ''
  return row.machine_id ? machineText(row) : JOBWORK_MACHINE_LABEL
}
