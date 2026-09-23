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
  const sorted = [...stages].sort((a, b) => a.seq - b.seq)

  function effectiveOutput(index) {
    if (index < 0) return orderQty
    const stage = sorted[index]
    if (stage.type === 'Manual') return effectiveOutput(index - 1)
    return stageAggregates[stage.id]?.output ?? 0
  }

  const availability = {}
  sorted.forEach((stage, i) => {
    const upstream = effectiveOutput(i - 1)
    const consumed = stageAggregates[stage.id]?.consumed ?? 0
    availability[stage.id] = Math.max(0, upstream - consumed)
  })
  return availability
}

/**
 * §4's auto-resolve: given the operations a machine can perform (from
 * machine ops) and a PRD's stages, finds the next stage the operator
 * should log on that machine -- the lowest-seq stage that is still
 * Pending, Internal, and whose operation the machine can perform. Returns
 * null if there is none (the caller should tell the operator clearly
 * rather than let them free-pick an operation).
 */
export function resolveNextEligibleStage(stages, machineOperations) {
  const opsSet = new Set(machineOperations)
  const sorted = [...stages].sort((a, b) => a.seq - b.seq)
  return (
    sorted.find(
      (s) => s.status === 'Pending' && s.type === 'Internal' && opsSet.has(s.operation)
    ) ?? null
  )
}

/** Cycle Time Master stores minutes-per-unit; standard qty/hour is its inverse. */
export function standardQtyPerHour(cycleTimeMin) {
  if (!cycleTimeMin || cycleTimeMin <= 0) return null
  return 60 / cycleTimeMin
}
