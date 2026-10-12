import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Field, TextInput } from '../FormSection'
import { addDays } from '../../utils/reportPeriods'
import { todayISO } from '../../utils/dates'

const BTN = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A9C8EE] bg-white px-4 text-[13px] font-semibold text-[#0A4CB0] hover:bg-[#E3F0FD] disabled:opacity-50'

/** Single-date filter (Daily reports): date, Today, Previous / Next Day, Refresh.
 * Next Day stops at today. */
export default function ReportDayBar({ date, onDateChange, onRefresh, loading }) {
  const today = todayISO()
  return (
    <section className="rounded-2xl border border-[#CFE2F8] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(16,60,120,0.06)]">
      <div className="flex flex-wrap items-end gap-3">
        <CalendarDays size={28} className="mb-1 text-[#1669E0]" aria-hidden="true" />
        <Field label="Date" width="short" className="max-w-[200px]">
          <TextInput type="date" value={date} max={today} onChange={(e) => e.target.value && onDateChange(e.target.value)} />
        </Field>
        <button
          type="button"
          onClick={() => onDateChange(today)}
          className="inline-flex h-8 items-center rounded-lg bg-[#1669E0] px-5 text-[13px] font-semibold text-white hover:bg-[#0F57C2]"
        >
          Today
        </button>
        <button type="button" className={BTN} onClick={() => onDateChange(addDays(date, -1))}>
          <ChevronLeft size={15} /> Previous Day
        </button>
        <button type="button" className={BTN} disabled={date >= today} onClick={() => onDateChange(addDays(date, 1))}>
          Next Day <ChevronRight size={15} />
        </button>
        <button type="button" className={`${BTN} ml-auto`} disabled={loading} onClick={onRefresh}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
    </section>
  )
}
