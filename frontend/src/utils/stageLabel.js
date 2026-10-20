// Stage numbering for display: a stage is shown by its POSITION in its PRD's
// route (1, 2, 3 … in seq order), not by the stored seq (10, 20 …). The
// stored seq is unchanged; masters that EDIT the sequence (Cycle Time
// Master) keep showing the real seq.

const bySeq = (a, b) => Number(a.seq) - Number(b.seq) || Number(a.id ?? 0) - Number(b.id ?? 0)

/** 1-based position of `stage` among `stagesOfPrd` (any order, gaps allowed). */
export function stageNumber(stage, stagesOfPrd = []) {
  if (!stage) return null
  const same = stagesOfPrd.filter((s) => s.prd_no == null || stage.prd_no == null || s.prd_no === stage.prd_no)
  const sorted = [...same].sort(bySeq)
  const i = sorted.findIndex((s) => (stage.id != null && s.id === stage.id) || (stage.id == null && Number(s.seq) === Number(stage.seq)))
  return i >= 0 ? i + 1 : null
}

/** The same stages with `position` set per PRD (input order kept). */
export function withStagePositions(stages = []) {
  const byPrd = new Map()
  for (const s of stages) byPrd.set(s.prd_no, [...(byPrd.get(s.prd_no) ?? []), s])
  const pos = new Map()
  for (const list of byPrd.values()) [...list].sort(bySeq).forEach((s, i) => pos.set(s, i + 1))
  return stages.map((s) => ({ ...s, position: pos.get(s) }))
}

/** Number shown for a stage: its position when known, else the stored seq. */
export function stageDisplayNumber(stage) {
  return stage?.position ?? stage?.seq
}

/** "Stage <position> – <operation>" (falls back to seq when no position is known). */
export function stageLabel(stage) {
  const n = stageDisplayNumber(stage)
  return stage.operation ? `Stage ${n} – ${stage.operation}` : `Stage ${n}`
}

/** seq -> position over the DISTINCT seqs of a route template (Cycle Time
 * Master can have several rows -- one per machine -- for the same seq; they
 * share one stage number). */
export function positionBySeq(rows = []) {
  const seqs = [...new Set(rows.map((r) => Number(r.seq)))].sort((a, b) => a - b)
  return new Map(seqs.map((s, i) => [s, i + 1]))
}
