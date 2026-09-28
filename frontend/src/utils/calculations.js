/**
 * Stage-to-stage quantity linkage (§4).
 *
 * Stage 1 (lowest seq) is capped by the order quantity itself. Stage N>1 is
 * capped by whatever stage N-1 actually produced, minus whatever's already
 * been consumed at stage N -- the same rule whether stage N runs on a
 * machine (Internal) or is sent out via Job Order (Outsourced), since both
 * draw from the same upstream pool.
 *
 * Manual stages (De-Burring, Final Inspection, Final Dispatch, ...) have no
 * logging screen of their own, so they're a pass-through: their "output",
 * for linkage purposes, is whatever the nearest prior stage produced.
 *
 * @param {Array<{id: number|string, seq: number, type: 'Internal'|'Outsourced'|'Manual'}>} stages
 *   Sorted or unsorted stages for one PRD; sorted internally by seq.
 * @param {number} orderQty - the customer order's order_qty, caps stage 1.
 * @param {Record<string, {output: number, consumed: number}>} stageAggregates
 *   Keyed by stage id. `output` = actual qty produced (Internal, from
 *   production log hours) or received (Outsourced, from job order receipt)
 *   at that stage. `consumed` = qty already logged (Internal, from
 *   production logs' planned_qty) or already dispatched (Outsourced, from
 *   job order dispatch qty) at that stage -- i.e. already drawn from the
 *   upstream pool. Manual stages need no entry (they're never looked up).
 * @returns {Record<string, number>} available qty to feed into each stage, by stage id.
 */
export function computeStageAvailability(stages, orderQty, stageAggregates) {
  const availability = {}
  const upstream = computeStageUpstreamTargets(stages, orderQty, stageAggregates)
  for (const [stageId, target] of Object.entries(upstream)) {
    const consumed = stageAggregates[stageId]?.consumed ?? 0
    availability[stageId] = Math.max(0, target - consumed)
  }
  return availability
}

/**
 * The upstream pool size for each stage -- what it should ultimately produce
 * once fed everything available to it (order_qty for stage 1, otherwise the
 * previous loggable stage's total output, skipping past Manual pass-through
 * stages). Used both by computeStageAvailability (upstream minus what's
 * already been drawn) and to auto-suggest when a stage looks finished
 * (actual output has caught up to this target).
 */
export function computeStageUpstreamTargets(stages, orderQty, stageAggregates) {
  const sorted = [...stages].sort((a, b) => a.seq - b.seq)

  function effectiveOutput(index) {
    if (index < 0) return orderQty
    const stage = sorted[index]
    if (stage.type === 'Manual') return effectiveOutput(index - 1)
    return stageAggregates[stage.id]?.output ?? 0
  }

  const targets = {}
  sorted.forEach((stage, i) => {
    targets[stage.id] = effectiveOutput(i - 1)
  })
  return targets
}

/**
 * A stage is only truly reachable if every earlier-seq stage of the same
 * PRD has actually been resolved (Completed or Received). Manual stages
 * are skipped in this check -- they have no entry screen, so nothing ever
 * marks them, and requiring them to be "done" would permanently block
 * everything after a Manual mid-route step.
 */
export function isStageReachable(stage, allStagesForPrd) {
  return allStagesForPrd
    .filter((s) => s.seq < stage.seq && s.type !== 'Manual')
    .every((s) => s.status === 'Completed' || s.status === 'Received')
}

/**
 * §4's auto-resolve: given the operations a machine can perform (from
 * machine ops) and a PRD's stages, finds the next stage the operator
 * should log on that machine -- the lowest-seq stage that is still
 * Pending, Internal, whose operation the machine can perform, AND whose
 * earlier stages are all already resolved (isStageReachable) -- otherwise
 * a machine could start logging against a stage with nothing real behind
 * it yet. Returns null if there is none (the caller should tell the
 * operator clearly rather than let them free-pick an operation).
 */
export function resolveNextEligibleStage(stages, machineOperations) {
  const opsSet = new Set(machineOperations)
  const sorted = [...stages].sort((a, b) => a.seq - b.seq)
  return (
    sorted.find(
      (s) =>
        s.status === 'Pending' &&
        s.type === 'Internal' &&
        opsSet.has(s.operation) &&
        isStageReachable(s, sorted)
    ) ?? null
  )
}

/** Cycle Time Master stores minutes-per-unit; standard qty/hour is its inverse. */
export function standardQtyPerHour(cycleTimeMin) {
  if (!cycleTimeMin || cycleTimeMin <= 0) return null
  return 60 / cycleTimeMin
}

/**
 * Derives a production plan's Status from its route card stages -- never
 * stored, always computed. Manual stages are ignored entirely (same
 * pass-through rule as isStageReachable) since nothing ever marks them,
 * so a Manual-only tail would otherwise permanently block "Completed".
 */
export function derivePlanStatus(stages) {
  const relevant = stages.filter((s) => s.type !== 'Manual')
  if (relevant.length === 0) return 'Planned'
  if (relevant.every((s) => s.status === 'Pending')) return 'Planned'
  if (relevant.every((s) => s.status === 'Completed' || s.status === 'Received')) return 'Completed'
  return 'In Progress'
}
