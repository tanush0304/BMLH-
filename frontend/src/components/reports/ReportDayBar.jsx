import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Field, TextInput } from '../FormSection'
import { addDays } from '../../utils/reportPeriods'
import { todayISO } from '../../utils/dates'
import ChartTypeToggle from './ChartTypeToggle'

const BTN = 'inline-flex h-9 items-center gap-2 rounded-lg border border-[#1E5FD0] bg-white px-5 text-[14px] font-semibold text-[#0B2A5B] hover:bg-[#E3F0FD] disabled:opacity-50'

/** Single-date filter (Daily reports): date, Today, Previous / Next Day, Refresh.
 * Next Day stops at today. `children` = extra filter fields after the date
 * buttons (e.g. Daily Machine's Machine filter). */
export default function ReportDayBar({ date, onDateChange, onRefresh, loading, children }) {
  const today = todayISO()
  return (
    <section className="rounded-xl border border-[#D6E4F5] bg-[#F4F8FE] px-4 py-3 shadow-[0_2px_6px_rgba(16,60,120,0.08)]">
      <div className="flex flex-wrap items-end gap-3 [&_label>span:first-child]:text-[13px] [&_label>span:first-child]:font-bold [&_label>span:first-child]:text-[#0B2A5B]">
        <span className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#1E5FD0] text-white" aria-hidden="true">
          <CalendarDays size={22} />
        </span>
        <Field label="Date" width="short" className="max-w-[200px]">
          <TextInput type="date" value={date} max={today} onChange={(e) => e.target.value && onDateChange(e.target.value)} />
        </Field>
        <button
          type="button"
          onClick={() => onDateChange(today)}
          className="inline-flex h-9 items-center rounded-lg bg-[#1E5FD0] px-8 text-[14px] font-semibold text-white shadow-sm hover:bg-[#164CB0]"
        >
          Today
        </button>
        <button type="button" className={BTN} onClick={() => onDateChange(addDays(date, -1))}>
          <ChevronLeft size={15} /> Previous Day
        </button>
        <button type="button" className={BTN} disabled={date >= today} onClick={() => onDateChange(addDays(date, 1))}>
          Next Day <ChevronRight size={15} />
        </button>
        {children}
        <div className="ml-auto flex flex-wrap gap-2">
          <ChartTypeToggle />
          <button type="button" className={BTN} disabled={loading} onClick={onRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>
    </section>
  )
}
