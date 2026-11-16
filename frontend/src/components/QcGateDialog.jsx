import { useCallback, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { jobworkQcGateSupported, loadQcGateData, createQcOverride } from '../data/queries/jobworkQc'
import { qcBlockers } from '../utils/jobworkQc'
import { canCompleteStageRole } from '../utils/stageStartGuard'

// Quality gate after jobwork (055), frontend side. One popup for the four
// insert paths (Data Entry / Manual Ops Start, Jobwork Dispatch, WIP Issue):
//   const qcGate = useQcGate({ role })
//   if (!(await qcGate.check({ prdNo, targetStageId, sourceStageId }))) return
//   ... {qcGate.dialog}
// check() resolves true when nothing blocks (or a supervisor overrode every
// blocking receipt with a reason), false when the popup was closed. Before 055
// / gate off -> true at once. A failed lookup never blocks here: the DB guard
// still refuses, and its message comes back as the screen's toast.
export function useQcGate({ role } = {}) {
  const [state, setState] = useState(null) // { blockers }
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const resolver = useRef(null)
  const keepOpen = useRef(false) // ConfirmDialog closes after onConfirm; stay open on an override error
  const canOverride = canCompleteStageRole(role) // supervisor / admin

  const finish = useCallback((value) => {
    resolver.current?.(value)
    resolver.current = null
    setState(null)
    setReason('')
    setError(null)
  }, [])

  const check = useCallback(async ({ prdNo, targetStageId, sourceStageId = null }) => {
    if (!prdNo || targetStageId == null || targetStageId === '') return true
    let blockers
    try {
      if (!(await jobworkQcGateSupported())) return true
      const data = await loadQcGateData({ prdNo })
      blockers = qcBlockers({ targetStageId, sourceStageId }, data)
    } catch (e) {
      console.warn('Incoming QC check failed', e)
      return true
    }
    if (!blockers.length) return true
    return new Promise((resolve) => {
      resolver.current = resolve
      setReason('')
      setError(null)
      setState({ blockers })
    })
  }, [])

  async function handleOverride() {
    const text = reason.trim()
    if (!text) return
    try {
      for (const b of state.blockers) await createQcOverride({ receiptId: b.receipt_id, reason: text })
      finish(true)
    } catch (e) {
      keepOpen.current = true
      setError(e.message)
    }
  }

  function handleClose() {
    if (keepOpen.current) {
      keepOpen.current = false
      return
    }
    finish(false)
  }

  const dialog = (
    <ConfirmDialog
      open={!!state}
      tone="notice"
      title="Incoming quality check pending"
      body={state?.blockers.length === 1 ? 'Material back from jobwork has not passed its quality inspection.' : `${state?.blockers.length ?? 0} jobwork receipts have not passed their quality inspection.`}
      confirmLabel={canOverride ? 'Override and continue' : 'OK'}
      hideCancel={!canOverride}
      cancelLabel="Cancel"
      confirmDisabled={canOverride && !reason.trim()}
      onConfirm={canOverride ? handleOverride : () => finish(false)}
      onClose={handleClose}
    >
      <ul className="mb-3 space-y-1.5 text-sm text-gray-800" data-testid="qc-gate-messages">
        {state?.blockers.map((b) => (
          <li key={b.receipt_id}>{b.message}</li>
        ))}
      </ul>
      {canOverride && (
        <label className="mb-3 block text-xs text-gray-700">
          Override reason (supervisor / admin, recorded per receipt)
          <textarea
            aria-label="Override reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
      )}
      {error && <p className="mb-3 text-xs text-red-700" role="alert">{error}</p>}
    </ConfirmDialog>
  )

  return { check, dialog }
}
