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
 * @param {{receiptedFrom?: Record<string, number>, issuedTo?: Record<string, number>}} [wipAggregates]
 *   From getWipAggregatesForPrd. `receiptedFrom[stageId]` = how much of that
 *   stage's output was pulled OUT into WIP holding instead of flowing
 *   straight downstream. `issuedTo[stageId]` = how much has been pulled
 *   FROM WIP holding INTO that stage, on top of whatever flows to it
 *   directly. Omit (or pass {}) where WIP doesn't apply.
 * @returns {Record<string, number>} available qty to feed into each stage, by stage id.
 */
export function computeStageAvailability(stages, orderQty, stageAggregates, wipAggregates = {}) {
  const { receiptedFrom = {}, issuedTo = {} } = wipAggregates
  const sorted = [...stages].sort((a, b) => a.seq - b.seq)

  // Same "skip past Manual pass-through stages" walk computeStageUpstreamTargets
  // does, but also surfacing WHICH stage's output is being carried forward --
  // WIP receipts/issues are keyed by stage id, so the carry-forward math needs
  // to know which upstream stage they're relative to, not just its output.
  function resolveUpstream(index) {
    if (index < 0) return { output: orderQty, stageId: null }
    const stage = sorted[index]
    if (stage.type === 'Manual') return resolveUpstream(index - 1)
    return { output: stageAggregates[stage.id]?.output ?? 0, stageId: stage.id }
  }

  const availability = {}
  sorted.forEach((stage, i) => {
    const { output: upstreamOutput, stageId: upstreamStageId } = resolveUpstream(i - 1)
    const receiptedAway = upstreamStageId ? receiptedFrom[upstreamStageId] ?? 0 : 0
    const issuedIn = issuedTo[stage.id] ?? 0
    const consumed = stageAggregates[stage.id]?.consumed ?? 0
    availability[stage.id] = Math.max(0, upstreamOutput - receiptedAway + issuedIn - consumed)
  })
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

// isStageReachable and resolveNextEligibleStage (the hard "every earlier
// stage must be Completed/Received first" gate) were removed here: WIP
// Receipt/Issue means a stage can legitimately be fed out of sequence, from
// WIP holding rather than strictly from the stage before it. The safety
// mechanism against double-working the same stage is now a lock based on
// existing data -- an open production log (Machine Entry, see
// getOpenLogForStage) or an open dispatch without a receipt (Job Order, see
// listPendingOutsourcedStagesForPrd) -- not sequence position.

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
