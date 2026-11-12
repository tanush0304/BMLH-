// Reopen a Completed stage (migration 049) + "Material available" on the
// stage bar (2026-11-12). Pure logic, tested in utils/stageReopen.test.js.
import { stageLabel } from './stageLabel'

const SUPERVISOR_ROLES = ['supervisor', 'admin']

/** Reopen button: supervisor / admin, 049 run, an Internal stage stored as Completed. */
export function canReopenStage({ role, supported, stageStatus }) {
  return !!supported && SUPERVISOR_ROLES.includes(role) && stageStatus === 'Completed'
}

/** "Can't reopen Stage 2 – Turning: a; b." from stage_reopen_blockers' list. */
export function reopenBlockedMessage(stage, blockers = []) {
  return `Can't reopen ${stageLabel(stage)}: ${blockers.join('; ')}.`
}

export function reopenReasonProblem(reason) {
  return String(reason ?? '').trim() ? null : 'Enter a reason to reopen the stage.'
}

function ddmmyyyy(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ts ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** "Reopened by Ravi on 12-11-2026: wrong qty" ('' when never reopened). */
export function reopenedNote(row, nameOf = (id) => id) {
  if (!row?.reopened_at) return ''
  const who = row.reopened_by ? ` by ${nameOf(row.reopened_by)}` : ''
  const why = row.reopen_reason ? `: ${row.reopen_reason}` : ''
  return `Reopened${who} on ${ddmmyyyy(row.reopened_at)}${why}`
}

const fmt = (n) => Number(n).toLocaleString('en-IN')

/**
 * Text next to "Stage output so far: X / target Y".
 *   no open log: "Material available: N" (+ " · can make M" when N < target, M = min(target, N))
 *   open log:    "Material reserved by this log: N" (the pool reads 0 while a log holds its share)
 * '' when there is nothing to show.
 */
export function materialAvailableText({ target, available, reserved, logOpen = false }) {
  if (logOpen) {
    return reserved == null || reserved === '' ? '' : `Material reserved by this log: ${fmt(reserved)}`
  }
  if (available == null || available === '' || !Number.isFinite(Number(available))) return ''
  const a = Number(available)
  const t = Number(target)
  let text = `Material available: ${fmt(a)}`
  if (Number.isFinite(t) && a < t) text += ` · can make ${fmt(Math.min(t, a))}`
  return text
}
