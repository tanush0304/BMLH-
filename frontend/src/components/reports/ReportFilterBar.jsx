import { CalendarDays, Search, RotateCcw } from 'lucide-react'
import { Field, TextInput, SelectInput } from '../FormSection'
import SearchableSelect from '../SearchableSelect'
import ChartTypeToggle from './ChartTypeToggle'
import { PERIOD_PRESETS } from '../../utils/reportPeriods'

/**
 * Period (preset + From/To) and report-specific dropdowns, with Search and
 * Reset. Editing From/To switches the preset to Custom Range.
 *   filters: [{ key, label, value, onChange(value), options }]  (SearchableSelect)
 */
export default function ReportFilterBar({ period, from, to, onPeriodChange, onFromChange, onToChange, filters = [], onSearch, onReset, loading }) {
  return (
    <section className="rounded-xl border border-[#D6E4F5] bg-[#F4F8FE] px-4 py-3 shadow-[0_2px_6px_rgba(16,60,120,0.08)]">
      <div className="flex flex-wrap items-end gap-3 [&_label>span:first-child]:text-[13px] [&_label>span:first-child]:font-bold [&_label>span:first-child]:text-[#0B2A5B]">
        <span className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#1E5FD0] text-white" aria-hidden="true">
          <CalendarDays size={22} />
        </span>
        <Field label="Period" width="short">
          <SelectInput value={period} onChange={(e) => onPeriodChange(e.target.value)} options={PERIOD_PRESETS} />
        </Field>
        <Field label="From" width="short">
          <TextInput type="date" value={from} max={to} onChange={(e) => onFromChange(e.target.value)} />
        </Field>
        <Field label="To" width="short">
          <TextInput type="date" value={to} min={from} onChange={(e) => onToChange(e.target.value)} />
        </Field>
        {filters.map((f) => (
          <Field key={f.key} label={f.label} width="short" className="max-w-[260px]">
            <SearchableSelect
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              options={withCurrentValue(f.options, f.value)}
              placeholder={`All ${f.allLabel ?? f.label}s`}
              aria-label={f.label}
            />
          </Field>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <ChartTypeToggle />
          <button
            type="button"
            onClick={onSearch}
            disabled={loading || !from || !to || from > to}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1E6FE8] px-6 text-[14px] font-semibold text-white shadow-sm hover:bg-[#165BC4] disabled:opacity-50"
          >
            <Search size={17} /> Search
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#1E5FD0] bg-white px-6 text-[14px] font-semibold text-[#0B2A5B] hover:bg-[#E3F0FD]"
          >
            <RotateCcw size={17} /> Reset
          </button>
        </div>
      </div>
    </section>
  )
}

// Options built from the loaded data can drop the picked value (e.g. a PRD
// with nothing in the period) -- keep it listed so it still shows and its
// clear (x) stays available.
function withCurrentValue(options = [], value) {
  if (value === '' || value == null) return options
  const has = options.some((o) => String(typeof o === 'object' ? o.value : o) === String(value))
  return has ? options : [...options, typeof options[0] === 'object' ? { value, label: String(value) } : value]
}
