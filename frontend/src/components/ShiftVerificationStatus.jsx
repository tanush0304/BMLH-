import { ShieldCheck, ShieldX } from 'lucide-react'
import { decisionText } from '../utils/shiftVerification'
import { todayISO } from '../utils/dates'

/**
 * The grid shift's verification (migration 028) on the hour-entry screens.
 * placement="top": the "Rejected: <reason>" banner, only when Rejected.
 * placement="bottom": the status line under the totals.
 */
export default function ShiftVerificationStatus({ verification, appUsers, placement = 'bottom' }) {
  const status = verification?.status ?? 'Pending'
  if (placement === 'top') {
    if (status !== 'Rejected') return null
    return (
      <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
        <ShieldX size={14} className="mt-px shrink-0" aria-hidden="true" />
        <span>
          {decisionText(verification, appUsers)} -- correct the hours below and Save Hours to resubmit.
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 pt-2 mt-2 border-t border-gray-100 text-sm">
      <ShieldCheck size={16} className={status === 'Approved' ? 'text-green-600' : 'text-gray-400'} aria-hidden="true" />
      {status === 'Approved' ? (
        <span className="text-green-700">{decisionText(verification, appUsers)}</span>
      ) : status === 'Rejected' ? (
        <span className="text-red-700">{decisionText(verification, appUsers)}</span>
      ) : (
        <span className="text-gray-500">Awaiting shift-incharge verification (Shift Verification screen)</span>
      )}
    </div>
  )
}

/** Shown while the grid is on an earlier date (correcting a Rejected shift). */
export function CorrectingShiftBanner({ entryDate, shiftCode, onBack }) {
  if (!entryDate || entryDate === todayISO()) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
      <span>
        Correcting <strong>{entryDate}</strong> · Shift <strong>{shiftCode}</strong> -- hours saved now go to that
        date and shift.
      </span>
      <button type="button" onClick={onBack} className="rounded bg-bmlhslate px-2 py-0.5 text-[11px] font-medium text-white">
        Back to today
      </button>
    </div>
  )
}
