// Production Data Entry / Manual Operations start safeguards (frontend only).
// Pure helpers: default stage pick, the pre-Start summary, the "nothing
// available" block, the earlier-stage-not-complete warning and the
// running-log banner text.
import { stageLabel, stageDisplayNumber } from './stageLabel'

const DONE = new Set(['Completed', 'Received'])
const bySeq = (a, b) => Number(a.seq) - Number(b.seq)

/**
 * The stage to pre-select after a PRD is picked: the EARLIEST (route card
 * order) of `candidates` -- this screen's pending stages that have a machine
 * -- with available qty > 0. null when none has anything available.
 */
export function pickDefaultStage(candidates, availability) {
  return [...candidates].sort(bySeq).find((s) => Number(availability?.[s.id] ?? 0) > 0) ?? null
}

/**
 * Machine to pre-select for that stage from the eligible {machine_id, seq}
 * rows (Cycle Time Master, as today): the route card stage's own machine when
 * it is eligible, else the first eligible machine for the stage's seq.
 */
export function defaultMachineForStage(stage, machineRows) {
  if (!stage) return ''
  const forSeq = machineRows.filter((r) => r.seq === stage.seq).map((r) => r.machine_id)
  if (stage.machine_id && forSeq.includes(stage.machine_id)) return stage.machine_id
  return forSeq[0] ?? ''
}

/** Hint next to Data Entry's (empty) Machine field: the next stage's
 * planned machine (route card), never pre-selected. "" when no next stage;
 * stage only when the planned machine isn't eligible. */
export function plannedMachineHint(stage, plannedMachineLabel, stageText) {
  if (!stage) return ''
  return plannedMachineLabel ? `Planned: ${plannedMachineLabel} (${stageText}, next stage)` : `Next stage: ${stageText}`
}

/** Eligible machine ids with the planned one first (order only). */
export function plannedFirst(ids, plannedId) {
  if (!plannedId || !ids.includes(plannedId)) return ids
  return [plannedId, ...ids.filter((id) => id !== plannedId)]
}

/** "Stage 20 – Rough Turning on CNC 1 (MC-004) · Available: 198" (no machine part on Manual Ops). */
export function startSummary({ stage, machineLabel, available }) {
  if (!stage) return ''
  const on = machineLabel ? ` on ${machineLabel}` : ''
  return `${stageLabel(stage)}${on} · Available: ${Number(available ?? 0)}`
}

/** Message when the stage has nothing to process yet. */
export function noAvailableMessage(stage) {
  return `Nothing available for Stage ${stageDisplayNumber(stage)} yet — the previous stage has not produced accepted pieces.`
}

/**
 * The nearest earlier stage of the PRD that is not complete (status not
 * Completed / Received), or null. allStages = every stage of the PRD.
 */
export function earlierIncompleteStage(allStages, stage) {
  if (!stage) return null
  const earlier = (allStages ?? []).filter((s) => Number(s.seq) < Number(stage.seq) && !DONE.has(s.status))
  return earlier.sort(bySeq).pop() ?? null
}

/** Amber warning text for an incomplete earlier stage. */
export function earlierStageWarning(prev) {
  return `${stageLabel(prev)} is not complete yet. Starting a later stage now is allowed only for partial batches.`
}

/** Can Start be pressed? available > 0, and the confirm box ticked when an earlier stage is incomplete. */
export function canStartStage({ available, earlierIncomplete, confirmed }) {
  if (!(Number(available ?? 0) > 0)) return false
  if (earlierIncomplete && !confirmed) return false
  return true
}

/** Open-log banner: "Running: Stage 3 – VMC Milling on VMC 2 (MC-011)" (no machine on Manual Ops). */
export function runningBanner({ stage, machineLabel }) {
  if (!stage) return ''
  return `Running: ${stageLabel(stage)}${machineLabel ? ` on ${machineLabel}` : ''}`
}

// ---------------------------------------------------------------- 2026-11-11
// Mark Stage Complete: supervisor / admin only (047 guard); prompted, never
// automatic. Trigger = pieces PROCESSED (incl. rejects / rework) >= target.

export const canCompleteStageRole = (role) => role === 'supervisor' || role === 'admin'

/** Processed output reached the stage target (target > 0). */
export function stageReachedTarget(output, target) {
  return Number(target) > 0 && Number(output) >= Number(target)
}

/** "Stage 2 – Turning reached 500 of 500 (accepted 488) -- mark it complete?" */
export function completePromptText({ label, output, target, accepted }) {
  return `${label} reached ${Number(output)} of ${Number(target)} (accepted ${Number(accepted)}) -- mark it complete?`
}

/** Operator note instead of the button. */
export function askSupervisorText({ label, output, target }) {
  return `${label} reached ${Number(output)} of ${Number(target)} -- ask a supervisor to mark it complete.`
}
