import { useEffect, useRef } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { friendlyDbMessage } from '../utils/dbErrors'

const TONES = {
  error: { box: 'bg-red-50 border-red-600', text: 'text-red-800', Icon: AlertCircle, icon: 'text-red-600', role: 'alert' },
  warning: { box: 'bg-amber-50 border-amber-600', text: 'text-amber-800', Icon: AlertTriangle, icon: 'text-amber-600', role: 'alert' },
  success: { box: 'bg-green-50 border-green-600', text: 'text-green-800', Icon: CheckCircle2, icon: 'text-green-600', role: 'status' },
}

// A generated document number (stores 022, jobwork, PRD / JC, complaints 027)
// in a success notice: the user may need to note it, so it never auto-hides.
const DOC_NO = /\b(?:GRN|RMI|WIR|WII|FGR|FGD|DC|JR|PRD|JC)-\d+|\bCMP-\d{4}-\d+/
export const showsDocumentNumber = (text) => typeof text === 'string' && DOC_NO.test(text)

export const AUTO_HIDE_MS = 4000

/**
 * Screen-level message: error / warning (role="alert") or success
 * (role="status"). Known raw DB texts are reworded (friendlyDbMessage) with the
 * raw text behind "Details". With onClose: an X to dismiss, and a success
 * banner hides itself after 4s unless it shows a document number.
 */
export default function Banner({ tone = 'error', message, onClose, className = '' }) {
  const t = TONES[tone] ?? TONES.error
  const ref = useRef(null)
  const raw = typeof message === 'string' ? message : String(message ?? '')
  const shown = friendlyDbMessage(raw)
  const autoHide = tone === 'success' && !!onClose && !showsDocumentNumber(shown)

  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [])

  useEffect(() => {
    if (!autoHide) return undefined
    const id = setTimeout(onClose, AUTO_HIDE_MS)
    return () => clearTimeout(id)
  }, [autoHide, onClose, raw])

  if (!raw) return null
  const { Icon } = t
  return (
    <div
      ref={ref}
      role={t.role}
      className={`flex items-start gap-2.5 rounded border-l-4 px-4 py-2.5 text-sm motion-safe:animate-banner-in ${t.box} ${className}`}
    >
      <Icon size={20} className={`mt-px shrink-0 ${t.icon}`} aria-hidden="true" />
      <div className={`min-w-0 flex-1 font-medium ${t.text}`}>
        {shown}
        {shown !== raw && (
          <span title={raw} className="ml-2 cursor-help text-xs font-normal underline decoration-dotted opacity-80">Details</span>
        )}
      </div>
      {onClose && (
        <button type="button" aria-label="Dismiss" onClick={onClose} className={`shrink-0 rounded p-0.5 hover:bg-black/5 ${t.text}`}>
          <X size={16} />
        </button>
      )}
    </div>
  )
}
