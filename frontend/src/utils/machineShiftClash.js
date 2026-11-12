// Production Data Entry: machine / shift clash check BEFORE Start (2026-11-12).
// Pure logic; the screen loads the open logs + the other logs' hour rows of the
// chosen machine + date + shift and shows the result.
//
//   running  another OPEN log holds the machine (any PRD / stage) -> Start
//            blocked for everyone (024's one-open-log-per-machine index is the
//            DB backstop). Not a clash: an open log of THIS PRD + a stage the
//            screen offers -- picking it resumes that log (shift handover).
//   full     net hours left = 0 (046 rules, every log on the machine), or the
//            gross slots are used up, or no hour slot is left after the last
//            used one (hour_slot max 12). Operators: blocked. Supervisor /
//            admin: "Start as overtime" ONLY while a slot is still free
//            (decision 2026-11-12, option (a) -- the 1-12 limit is unchanged).
//   partial  some hours used -> amber note, Start allowed.
//   free     nothing logged on that machine + date + shift.
//
// New logs' hour slots start AFTER the last slot already used on the machine
// + date + shift (grid rule, `otherLogSlots` / `slotBlockedByOtherLog`); 050
// only refuses the same slot twice in the DB.
import { shiftHoursStatus, fmtHrs } from './shiftHoursLimit'

export const MAX_HOUR_SLOT = 12 // "production log hours".hour_slot 1-12

function ddmmyyyy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso ?? ''
}

/** Distinct PRDs in first-seen order of their earliest slot. */
function prdList(rows) {
  const sorted = [...rows].sort((a, b) => Number(a.hour_slot) - Number(b.hour_slot))
  return [...new Set(sorted.map((r) => r.prd_no).filter(Boolean))]
}

/**
 * Slots other logs already used on the machine + date + shift.
 * rows: [{ log_id, prd_no, hour_slot }] -> { bySlot: Map(slot -> [prd...]), lastSlot }
 */
export function otherLogSlots(rows = []) {
  const bySlot = new Map()
  let lastSlot = 0
  for (const r of rows) {
    const slot = Number(r.hour_slot)
    if (!Number.isFinite(slot)) continue
    const list = bySlot.get(slot) ?? []
    if (r.prd_no && !list.includes(r.prd_no)) list.push(r.prd_no)
    bySlot.set(slot, list)
    lastSlot = Math.max(lastSlot, slot)
  }
  return { bySlot, lastSlot }
}

/**
 * Grid rule: a slot this log has NOT saved is closed when another log used it,
 * or when it lies before the last slot other logs used (new hours go after it).
 * Returns null (open) or the note to show: "used by PRD-003" / "before PRD-003's last hour".
 */
export function slotBlockedByOtherLog(slot, info, ownSavedSlots = new Set()) {
  if (!info || ownSavedSlots.has(slot)) return null
  const used = info.bySlot.get(slot)
  if (used) return `used by ${used.length ? used.join(', ') : 'another log'}`
  if (slot < info.lastSlot) {
    const lastPrds = info.bySlot.get(info.lastSlot) ?? []
    return `before ${lastPrds.length ? `${lastPrds.join(', ')}'s` : 'the'} last hour`
  }
  return null
}

/**
 * The open log holding `machineId`, unless it is a log the screen would resume
 * (same PRD and one of `resumableStageIds`). openLogs: [{ id, prd_no, stage_id,
 * machine_id, stage_seq? }].
 */
export function runningLogOnMachine(openLogs = [], machineId, { prdNo, resumableStageIds = [] } = {}) {
  if (!machineId) return null
  return openLogs.find((l) =>
    l.machine_id === machineId && !(prdNo && l.prd_no === prdNo && resumableStageIds.some((id) => String(id) === String(l.stage_id)))
  ) ?? null
}

export function runningMessage(log, machineLabel) {
  const stage = log.stage_seq != null ? ` Stage ${log.stage_seq}` : ''
  return `${machineLabel} is running ${log.prd_no}${stage} (log #${log.id}). End that log first.`
}

/**
 * kind: 'running' | 'full' | 'partial' | 'free'
 *   machineLabel, logDate (ISO), shift { shift_code, start_time, end_time, lunch_break_duration }
 *   openLogs     every open log (with stage_seq = route position for the message)
 *   otherRows    other logs' hour rows on machine + date + shift: { log_id, prd_no, hour_slot, lunch }
 *   prdNo, resumableStageIds   see runningLogOnMachine
 *   canOvertime  supervisor / admin
 * Returns { kind, message, runningLog, prds, remainingMin, capMin, workedMin,
 *           lastSlot, firstFreeSlot, slotLeft, overtimeAllowed }.
 */
export function machineShiftClash({ machineId, machineLabel, logDate, shift, openLogs = [], otherRows = [], prdNo, resumableStageIds = [], canOvertime = false }) {
  const label = machineLabel || machineId || ''
  const running = runningLogOnMachine(openLogs, machineId, { prdNo, resumableStageIds })
  const { lastSlot } = otherLogSlots(otherRows)
  const firstFreeSlot = lastSlot + 1
  const slotLeft = firstFreeSlot <= MAX_HOUR_SLOT
  const prds = prdList(otherRows)
  const base = { runningLog: running, prds, lastSlot, firstFreeSlot, slotLeft, remainingMin: null, capMin: null, workedMin: 0, overtimeAllowed: false }
  if (running) return { ...base, kind: 'running', message: runningMessage(running, label) }
  if (!otherRows.length) return { ...base, kind: 'free', message: '' }

  const status = shiftHoursStatus({ shift, otherRows })
  const code = shift?.shift_code ?? ''
  const date = ddmmyyyy(logDate)
  const by = prds.length ? ` by ${prds.join(', ')}` : ''
  const capMin = status ? status.netMin ?? status.grossMin : null
  const workedMin = status?.workedMin ?? 0
  const remainingMin = status?.remainingMin ?? null
  const hoursGone = !!status && (status.remainingMin === 0 || status.usedMin >= status.grossMin)
  const full = hoursGone || !slotLeft
  const info = { ...base, capMin, workedMin, remainingMin }
  if (full) {
    const used = capMin != null ? `${fmtHrs(workedMin)} of ${fmtHrs(capMin)} hrs${by}` : `hour ${lastSlot} used${by}`
    const noSlot = !slotLeft ? ` No hour slot is left after hour ${lastSlot}.` : ''
    return {
      ...info,
      kind: 'full',
      overtimeAllowed: canOvertime && slotLeft,
      message: `${code} on ${label} for ${date} is fully used (${used}).${noSlot} Pick another machine or shift.`,
    }
  }
  const left = remainingMin != null && capMin != null
    ? `${fmtHrs(remainingMin)} of ${fmtHrs(capMin)} ${status.netMin != null ? 'net ' : ''}hrs left (${fmtHrs(workedMin)} used${by})`
    : `already used${by}`
  return {
    ...info,
    kind: 'partial',
    message: `${code} on ${label} for ${date}: ${left}. New hours start at hour ${firstFreeSlot}.`,
  }
}

/** Can Start go ahead with this clash result? overtimeConfirmed = the supervisor pressed "Start as overtime". */
export function clashAllowsStart(clash, { overtimeConfirmed = false } = {}) {
  if (!clash) return true
  if (clash.kind === 'running') return false
  if (clash.kind === 'full') return clash.overtimeAllowed && overtimeConfirmed
  return true
}
