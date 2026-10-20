import { useState } from 'react'
import { Ban } from 'lucide-react'
import { voidReasonError } from '../utils/voidEntry'

/** List column: red VOID badge, who / when / reason on hover. Export text = void_label. */
export const VOID_COLUMN = {
  key: 'void_label',
  label: 'Void',
  render: (r) =>
    r.void_label ? (
      <span
        title={r.void_label}
        className="inline-flex rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 no-underline"
        style={{ textDecoration: 'none' }}
      >
        VOID
      </span>
    ) : (
      ''
    ),
}

/**
 * Confirm dialog for a void: reason required, "This cannot be undone".
 * onConfirm(reason) returns an error string to show, or null when done.
 */
export default function VoidEntryDialog({ docNo, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    const problem = voidReasonError(reason)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const message = await onConfirm(reason.trim())
      if (message) setError(message)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Void ${docNo}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-red-700">
          <Ban size={18} />
          <h2 className="text-base font-semibold">Void {docNo}</h2>
        </div>
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          The entry stays in the list marked VOID and no longer counts anywhere. <strong>This cannot be undone.</strong>
        </p>
        {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="block text-xs font-medium text-slate-700">
          Reason <span className="text-red-600">*</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
            placeholder="Why is this entry being voided?"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={busy} className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
            {busy ? 'Voiding...' : 'Void Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
