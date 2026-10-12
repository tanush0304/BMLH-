import { CalendarDays, Search, RotateCcw } from 'lucide-react'
import { Field, TextInput, SelectInput } from '../FormSection'
import SearchableSelect from '../SearchableSelect'
import { PERIOD_PRESETS } from '../../utils/reportPeriods'

/**
 * Period (preset + From/To) and report-specific dropdowns, with Search and
 * Reset. Editing From/To switches the preset to Custom Range.
 *   filters: [{ key, label, value, onChange(value), options }]  (SearchableSelect)
 */
export default function ReportFilterBar({ period, from, to, onPeriodChange, onFromChange, onToChange, filters = [], onSearch, onReset, loading }) {
  return (
    <section className="rounded-2xl border border-[#CFE2F8] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(16,60,120,0.06)]">
      <div className="flex flex-wrap items-end gap-3">
        <CalendarDays size={28} className="mb-1 text-[#1669E0]" aria-hidden="true" />
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
          <Field key={f.key} label={f.label} width="short">
            <SearchableSelect
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              options={f.options}
              placeholder={`All ${f.allLabel ?? f.label}s`}
              aria-label={f.label}
            />
          </Field>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onSearch}
            disabled={loading || !from || !to || from > to}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1669E0] px-4 text-[13px] font-semibold text-white hover:bg-[#0F57C2] disabled:opacity-50"
          >
            <Search size={15} /> Search
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A9C8EE] bg-white px-4 text-[13px] font-semibold text-[#0A4CB0] hover:bg-[#E3F0FD]"
          >
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      </div>
    </section>
  )
}
