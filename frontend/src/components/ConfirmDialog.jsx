import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

/**
 * In-app delete confirmation (same look as VoidEntryDialog). Cancel has focus
 * on open; Esc / backdrop / Cancel close it. Delete is a plain button outside
 * any form, so Enter deletes only when Delete itself is focused. While
 * onConfirm runs: spinner, both buttons disabled, Esc / backdrop ignored; the
 * dialog then closes -- the screen's own catch shows any error in its Banner.
 *   title        default "Delete <recordType>?"
 *   body         default "<label> will be permanently deleted. This can't be undone."
 *   confirmLabel default "Delete"
 */
export default function ConfirmDialog({ open, recordType = 'record', label, title, body, confirmLabel = 'Delete', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setBusy(false)
    cancelRef.current?.focus()
    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } catch {
      // Each screen's delete catches and shows its own Banner; nothing to add here.
    } finally {
      setBusy(false)
      onClose()
    }
  }

  const heading = title ?? `Delete ${recordType}?`
  return (
    <div
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-body" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-red-700">
          <Trash2 size={18} />
          <h2 id="confirm-dialog-title" className="text-base font-semibold">{heading}</h2>
        </div>
        <p id="confirm-dialog-body" className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {body ?? (
            <>
              <strong>{label}</strong> will be permanently deleted. This can't be undone.
            </>
          )}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onClose} disabled={busy} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={busy} className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * const del = useDeleteConfirm()
 * onDelete={() => del.ask({ recordType: 'customer', label: 'CUST-001 – Acme', run: async () => { ...existing delete... } })}
 * {del.dialog}
 */
export function useDeleteConfirm() {
  const [req, setReq] = useState(null)
  const ask = useCallback((r) => setReq(r), [])
  const close = useCallback(() => setReq(null), [])
  const dialog = (
    <ConfirmDialog
      open={!!req}
      recordType={req?.recordType}
      label={req?.label}
      title={req?.title}
      body={req?.body}
      confirmLabel={req?.confirmLabel}
      onConfirm={() => req?.run()}
      onClose={close}
    />
  )
  return { ask, dialog }
}

/** "KEY – name", or just the key when there is no name. */
export const recordLabel = (key, name) => [key, name].filter((v) => v != null && String(v).trim() !== '').join(' – ')
