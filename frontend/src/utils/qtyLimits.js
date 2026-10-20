// Quantity ceilings for stock movements that take a stage's GOOD output.
// "Accepted" = produced − rejected − rework for logged stages, and the qty
// received back for outsourced (jobwork) stages -- see
// getStageAggregatesForPrd. Rejected / rework pieces never move on.

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Accepted qty of one stage from getStageAggregatesForPrd's result. */
export function stageAcceptedQty(stageAggregates, stageId) {
  const a = stageAggregates?.[stageId]
  if (!a) return 0
  return num(a.accepted ?? a.output)
}

/** Accepted qty per log hour: produced − rejected − rework, never below 0. */
export function acceptedFromHour(hour) {
  return Math.max(0, num(hour?.qty_produced) - num(hour?.qty_rejected) - num(hour?.qty_rework))
}

/** WIP Receipt: a stage's accepted qty minus what has already been received
 * into WIP from it, minus what the NEXT stage took directly from it (its
 * consumption -- log planned qty / jobwork dispatched -- less what WIP
 * issued into it). Never below 0. */
export function wipReceiptAvailable({ stageAccepted, alreadyReceived, nextConsumed = 0, issuedIntoNext = 0 }) {
  const takenDirectly = Math.max(0, num(nextConsumed) - num(issuedIntoNext))
  return Math.max(0, num(stageAccepted) - num(alreadyReceived) - takenDirectly)
}

/** FG Receipt: both ceilings and the binding one. By production = this PRD's
 * last-stage accepted - FG received for the PRD; by order = the PO line's
 * order qty - FG received across ALL the line's PRDs (migration 030; defaults
 * to the PRD's own receipts when lineFgReceived is not given). */
export function fgReceiptLimits({ lastStageAccepted, orderQty, fgReceived, lineFgReceived = fgReceived }) {
  const fromProduction = Math.max(0, num(lastStageAccepted) - num(fgReceived))
  const fromOrder = Math.max(0, num(orderQty) - num(lineFgReceived))
  return { fromProduction, fromOrder, max: Math.min(fromProduction, fromOrder) }
}

/** The last stage of a route card (highest seq), or null. */
export function lastStage(stages) {
  if (!stages?.length) return null
  return [...stages].sort((a, b) => num(a.seq) - num(b.seq))[stages.length - 1]
}

/** null when qty ≤ max, otherwise `${what} (${qty}) is more than ${limitText} (${max}).` */
export function qtyOverLimitError(qty, max, what, limitText) {
  if (num(qty) <= num(max)) return null
  return `${what} (${num(qty)}) is more than ${limitText} (${num(max)}).`
}
