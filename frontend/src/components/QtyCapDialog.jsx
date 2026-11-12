// Hour qty cap popup (PRD-009 / 051), shared by Production Data Entry,
// Manual Operations and Shift Verification.
//   notify(blocks)     -> "Quantity over the limit", OK only (nothing saved)
//   confirm(warnings)  -> Promise<boolean>: supervisor / admin under
//                         supervisor_override -- "Save anyway" resolves true,
//                         Cancel / Esc false.
import { useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

export function useQtyCapDialog() {
  const [state, setState] = useState(null) // { kind: 'block' | 'warn', items }
  const resolver = useRef(null)

  function settle(value) {
    resolver.current?.(value)
    resolver.current = null
  }

  const notify = (items) => setState({ kind: 'block', items })
  const confirm = (items) =>
    new Promise((resolve) => {
      resolver.current = resolve
      setState({ kind: 'warn', items })
    })

  const warn = state?.kind === 'warn'
  const dialog = (
    <ConfirmDialog
      open={!!state}
      tone="notice"
      title={warn ? 'Over the hourly standard' : 'Quantity over the limit'}
      body={warn ? 'These hours are over the standard. As a supervisor / admin you can still save them:' : 'Correct these hour rows -- they were not saved:'}
      hideCancel={!warn}
      cancelLabel="Cancel"
      confirmLabel={warn ? 'Save anyway' : 'OK'}
      onConfirm={() => settle(true)}
      onClose={() => {
        settle(false) // no-op after a confirm (already settled)
        setState(null)
      }}
    >
      <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-gray-800" data-testid="qty-cap-list">
        {(state?.items ?? []).map((m) => <li key={m}>{m}</li>)}
      </ul>
    </ConfirmDialog>
  )
  return { dialog, notify, confirm }
}

/** blocks -> popup, false; warnings -> confirm (true = go on); none -> true. */
export async function passQtyCap({ blocks, warnings }, { notify, confirm }) {
  if (blocks.length) {
    notify(blocks)
    return false
  }
  if (warnings.length) return confirm(warnings)
  return true
}
