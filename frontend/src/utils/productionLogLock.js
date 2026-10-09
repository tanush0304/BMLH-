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
