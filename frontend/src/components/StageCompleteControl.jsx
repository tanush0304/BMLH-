import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import { stageLabel } from '../utils/stageLabel'
import { askSupervisorText, canCompleteStageRole, completePromptText, stageReachedTarget } from '../utils/stageStartGuard'

/**
 * Mark Stage Complete (Data Entry + Manual Operations, 2026-11-11).
 * - Only once processed output >= target (as before).
 * - Supervisor / admin: "Mark Stage Complete" button -> confirm dialog
 *   "Stage X reached N of N (accepted M) -- mark it complete?". The same
 *   dialog also opens by itself ONCE when the target is first reached on this
 *   log (`promptKey`); "Not now" keeps it quiet for that key. Never automatic.
 * - Operator: no button, a note "... ask a supervisor to mark it complete."
 * The 047 DB guard refuses a non-supervisor anyway.
 */
export default function StageCompleteControl({ stage, output, target, accepted, role, completing, onComplete, promptKey }) {
  const reached = stageReachedTarget(output, target)
  const canComplete = canCompleteStageRole(role)
  const [open, setOpen] = useState(false)
  const promptedRef = useRef(new Set())
  const label = stage ? stageLabel(stage) : 'This stage'

  // Auto-prompt once per key when the target is reached (supervisor / admin only).
  useEffect(() => {
    if (!reached || !canComplete || !promptKey || promptedRef.current.has(promptKey)) return
    promptedRef.current.add(promptKey)
    setOpen(true)
  }, [reached, canComplete, promptKey])

  if (!reached) return null

  if (!canComplete) {
    return (
      <span className="text-sm font-medium text-amber-700" data-testid="ask-supervisor-note">
        {askSupervisorText({ label, output, target })}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={completing}
        className="inline-flex items-center gap-1.5 bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-green-700"
      >
        <CheckCircle2 size={15} />
        {completing ? 'Marking Complete...' : 'Mark Stage Complete'}
      </button>
      <ConfirmDialog
        open={open}
        tone="confirm"
        title="Mark stage complete?"
        body={completePromptText({ label, output, target, accepted })}
        confirmLabel="Mark Complete"
        cancelLabel="Not now"
        onConfirm={onComplete}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
