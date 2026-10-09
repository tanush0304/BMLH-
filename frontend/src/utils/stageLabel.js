/** Dropdown label for a route card stage: "Stage <seq> – <operation>". */
export function stageLabel(stage) {
  return stage.operation ? `Stage ${stage.seq} – ${stage.operation}` : `Stage ${stage.seq}`
}
