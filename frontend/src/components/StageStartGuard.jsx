import { AlertTriangle, Ban } from 'lucide-react'
import { startSummary, noAvailableMessage, earlierStageWarning } from '../utils/stageStartGuard'

/**
 * Shown above Start (Production Data Entry / Manual Operations, before a log
 * is open): the summary line, the "nothing available" block, and the amber
 * earlier-stage warning with its "I confirm" tick box (in-app, no dialogs).
 */
export default function StageStartGuard({ stage, machineLabel, available, earlierIncomplete, confirmed, onConfirmChange }) {
  if (!stage) return null
  const none = !(Number(available ?? 0) > 0)
  return (
    <div className="sm:col-span-3 space-y-1.5" data-testid="stage-start-guard">
      <p className="rounded border border-[#A9C8EE] bg-[#EAF2FD] px-3 py-1.5 text-[13px] font-semibold text-[#0B2A5B]">
        {startSummary({ stage, machineLabel, available })}
      </p>
      {none && (
        <p role="alert" className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-[13px] text-red-700">
          <Ban size={15} className="mt-px shrink-0" aria-hidden="true" />
          {noAvailableMessage(stage)}
        </p>
      )}
      {!none && earlierIncomplete && (
        <div role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-[13px] text-amber-800">
          <p className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden="true" />
            {earlierStageWarning(earlierIncomplete)}
          </p>
          <label className="mt-1 flex items-center gap-2 font-medium">
            <input type="checkbox" checked={!!confirmed} onChange={(e) => onConfirmChange?.(e.target.checked)} />
            I confirm
          </label>
        </div>
      )}
    </div>
  )
}
