import { useEffect, useId, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { friendlyDbMessage } from '../utils/dbErrors'

// Floating toast: solid colour, fixed top-centre below the 78px header, above
// dialogs (z-50) so it shows wherever the page is scrolled.
const TONES = {
  error: { box: 'bg-red-600 text-white', Icon: AlertCircle, role: 'alert' },
  warning: { box: 'bg-amber-500 text-slate-900', Icon: AlertTriangle, role: 'alert' },
  success: { box: 'bg-green-600 text-white', Icon: CheckCircle2, role: 'status' },
}
// `inline`: a standing note in the page flow (light bg, 4px left border).
const INLINE_TONES = {
  error: { box: 'bg-red-50 border-red-600', text: 'text-red-800', icon: 'text-red-600' },
  warning: { box: 'bg-amber-50 border-amber-600', text: 'text-amber-800', icon: 'text-amber-600' },
  success: { box: 'bg-green-50 border-green-600', text: 'text-green-800', icon: 'text-green-600' },
}

// A generated document number (stores 022, jobwork, PRD / JC, complaints 027)
// in a success notice: the user may need to note it, so it never auto-hides.
const DOC_NO = /\b(?:GRN|RMI|WIR|WII|FGR|FGD|DC|JR|PRD|JC)-\d+|\bCMP-\d{4}-\d+/
export const showsDocumentNumber = (text) => typeof text === 'string' && DOC_NO.test(text)

export const AUTO_HIDE_MS = 4000

// Newest-wins registry of the toasts that currently have a message: only the
// newest shows; when it clears, the previous one (if still set) comes back.
let seq = 0
const active = new Map() // id -> order
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function newestId() {
  let best = null
  let bestOrder = -1
  for (const [id, order] of active) {
    if (order > bestOrder) {
      best = id
      bestOrder = order
    }
  }
  return best
}

/**
 * Screen-level message: error / warning (role="alert") or success
 * (role="status"), shown as a toast (one at a time, newest wins) unless
 * `inline`. Known raw DB texts are reworded (friendlyDbMessage) with the raw
 * text behind "Details". With onClose: an X to dismiss, and a success message
 * hides itself after 4s unless it shows a document number. Errors and
 * warnings stay until dismissed or the screen clears them.
 */
export default function Banner({ tone = 'error', message, onClose, className = '', inline = false }) {
  const id = useId()
  const raw = typeof message === 'string' ? message : String(message ?? '')
  const shown = friendlyDbMessage(raw)
  const autoHide = tone === 'success' && !!onClose && !showsDocumentNumber(shown)

  useEffect(() => {
    if (inline || !raw) return undefined
    active.set(id, ++seq)
    emit()
    return () => {
      active.delete(id)
      emit()
    }
  }, [id, raw, inline])
  const shownId = useSyncExternalStore(subscribe, newestId, () => null)

  useEffect(() => {
    if (!autoHide) return undefined
    const t = setTimeout(onClose, AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [autoHide, onClose, raw])

  if (!raw) return null
  const t = TONES[tone] ?? TONES.error
  const { Icon } = t
  const details = shown !== raw && (
    <span title={raw} className="ml-2 cursor-help text-xs font-normal underline decoration-dotted opacity-80">Details</span>
  )

  if (inline) {
    const it = INLINE_TONES[tone] ?? INLINE_TONES.error
    return (
      <div role={t.role} className={`flex items-start gap-2.5 rounded border-l-4 px-4 py-2.5 text-sm motion-safe:animate-banner-in ${it.box} ${className}`}>
        <Icon size={20} className={`mt-px shrink-0 ${it.icon}`} aria-hidden="true" />
        <div className={`min-w-0 flex-1 font-medium ${it.text}`}>{shown}{details}</div>
        {onClose && (
          <button type="button" aria-label="Dismiss" onClick={onClose} className={`shrink-0 rounded p-0.5 hover:bg-black/5 ${it.text}`}>
            <X size={16} />
          </button>
        )}
      </div>
    )
  }

  if (shownId !== id || typeof document === 'undefined') return null
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[86px] z-[60] flex justify-center px-4" data-testid="toast">
      <div
        role={t.role}
        data-tone={tone}
        className={`pointer-events-auto flex w-full max-w-[640px] items-start gap-2.5 rounded-lg px-4 py-3 text-sm shadow-2xl ring-1 ring-black/10 motion-safe:animate-toast-in ${t.box}`}
      >
        <Icon size={20} className="mt-px shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 font-medium">{shown}{details}</div>
        {onClose && (
          <button type="button" aria-label="Dismiss" onClick={onClose} className="-mr-1 shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <X size={16} />
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
