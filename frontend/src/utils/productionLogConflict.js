import { stageLabel } from './stageLabel'

export const MACHINE_OPEN_LOG_INDEX = 'production_logs_one_open_per_machine'
export const SAME_STAGE_MESSAGE = 'Someone already started this stage. Refresh and resume their session instead.'

/** A 23505 from inserting a production log: true when it's the
 * one-open-log-per-machine index (migration 024), not the per-stage one. */
export function isMachineBusyError(error) {
  if (error?.code !== '23505') return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return text.includes(MACHINE_OPEN_LOG_INDEX)
}

/** "<machine name> already has an open log (PRD …, Stage N – …). End or
 * complete that log first." -- falls back to the machine id / "unknown" when
 * the open log or its stage can't be read. */
export function machineBusyMessage({ machine, machineId, openLog, stage }) {
  const name = machine?.machine_name || machineId
  const parts = []
  if (openLog?.prd_no) parts.push(`PRD ${openLog.prd_no}`)
  if (stage) parts.push(stageLabel(stage))
  const detail = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  return `${name} already has an open log${detail}. End or complete that log first.`
}
