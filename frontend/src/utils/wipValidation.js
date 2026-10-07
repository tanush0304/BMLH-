export function parsePositiveWipQuantity(value) {
  const quantity = parseFiniteDecimal(value)
  return quantity !== null && quantity > 0 ? quantity : null
}

export function validateWipReceiptStage(prdNo, stageId, completedStages) {
  if (!prdNo) return 'Select a Production Order first.'
  if (stageId === '' || stageId === null || stageId === undefined) {
    return "Select a completed stage from this Production Order's Route Card."
  }

  const stage = completedStages.find(
    (candidate) => sameId(candidate.id, stageId) && sameId(candidate.prd_no, prdNo)
  )
  return stage ? null : "The selected completed stage does not belong to this Production Order's Route Card."
}

export function validateWipIssueStages(prdNo, sourceStageId, targetStageId, stages) {
  if (!prdNo) return { error: 'Select a Production Order first.' }
  if (sourceStageId === '' || sourceStageId === null || sourceStageId === undefined) {
    return { error: 'Select a source WIP stage with available balance.' }
  }
  if (targetStageId === '' || targetStageId === null || targetStageId === undefined) {
    return { error: "Select a destination stage from this Production Order's Route Card." }
  }

  const sourceStage = stages.find(
    (stage) => sameId(stage.id, sourceStageId) && sameId(stage.prd_no, prdNo)
  )
  if (!sourceStage) {
    return { error: "The source WIP stage does not belong to this Production Order's Route Card." }
  }

  const targetStage = stages.find(
    (stage) =>
      sameId(stage.id, targetStageId) &&
      sameId(stage.prd_no, prdNo) &&
      stage.type !== 'Manual'
  )
  if (!targetStage) {
    return { error: "The destination stage is not a valid stage on this Production Order's Route Card." }
  }

  return { sourceStage, targetStage, error: null }
}

export function validateWipIssueQuantity(value, availableBalance) {
  const quantity = parsePositiveWipQuantity(value)
  if (quantity === null) {
    return { quantity: null, error: 'Quantity must be a finite number greater than zero.' }
  }

  const balance = parseFiniteDecimal(availableBalance)
  if (balance === null || balance < 0) {
    return { quantity: null, error: 'Available WIP balance is unavailable for the selected source stage.' }
  }
  if (quantity > balance) {
    return { quantity: null, error: 'Issue quantity cannot exceed the available WIP balance in this source stage.' }
  }

  return { quantity, error: null }
}

function sameId(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right)
}

function parseFiniteDecimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}
