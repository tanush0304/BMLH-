/**
 * End Log: the log keeps only what it actually used from its reservation --
 * every piece processed across its hours, never more than it originally
 * reserved. qty_produced is already that total: accepted + rejected + rework
 * (accepted itself is derived as produced - rejected - rework, see
 * acceptedQty in productionReport.js), so rejected/rework are NOT added again.
 */
export function releasedPlannedQty(plannedQty, hours) {
  const produced = hours.reduce((sum, h) => sum + Number(h.qty_produced ?? 0), 0)
  const planned = Number(plannedQty ?? 0)
  return Math.min(planned, produced)
}

/**
 * The first of this user's open logs (newest first) whose stage is one this
 * screen handles (`stages` = that screen's own pending stages), with its
 * stage -- or null.
 */
export function pickOpenLogForScreen(openLogs, stages) {
  for (const log of openLogs) {
    const stage = stages.find((s) => String(s.id) === String(log.stage_id))
    if (stage) return { log, stage }
  }
  return null
}

// Shown instead of saving when the open log no longer matches what the screen
// shows (a stale async response replaced part of the selection).
export const OUT_OF_SYNC_MESSAGE = 'Screen out of sync, reload the log'

/**
 * True when `log` is the log for the PRD / stage (/ machine) on screen.
 * machineId is optional -- Manual Operations has no machine.
 */
export function logMatchesScreen(log, { prdNo, stageId, machineId } = {}) {
  if (!log) return false
  if (String(log.prd_no) !== String(prdNo ?? '')) return false
  if (String(log.stage_id) !== String(stageId ?? '')) return false
  if (machineId !== undefined && String(log.machine_id ?? '') !== String(machineId ?? '')) return false
  return true
}

/**
 * Latest-request-wins: start() returns a token; isCurrent(token) is false
 * once a newer start() happened, so a superseded async chain drops its result.
 */
export function createRequestGate() {
  let latest = 0
  return {
    start: () => ++latest,
    isCurrent: (token) => token === latest,
  }
}
