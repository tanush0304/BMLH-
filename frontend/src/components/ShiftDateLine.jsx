import { CalendarClock } from 'lucide-react'
import { shiftDateLine } from '../utils/shiftDateLine'

/** Read-only "Date: … · Shift … (start–end)" line (see utils/shiftDateLine). */
export default function ShiftDateLine({ date, shiftCode, shifts }) {
  const text = shiftDateLine({ date, shiftCode, shifts })
  if (!text) return null
  return (
    <div
      data-testid="shift-date-line"
      className="flex items-center gap-2 rounded-md border border-[#D5E3F4] bg-white px-3 py-1.5 text-[13px] font-medium text-[#0B2A5B]"
    >
      <CalendarClock size={15} className="text-bmlhblue" aria-hidden="true" />
      {text}
    </div>
  )
}
