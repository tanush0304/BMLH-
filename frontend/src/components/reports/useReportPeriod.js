import { useState } from 'react'
import { DEFAULT_PERIOD, periodRange } from '../../utils/reportPeriods'

/**
 * Period + filter state for a ReportFilterBar screen. Edits stay local until
 * Search copies them into `applied` (what the screen loads); Reset restores
 * the default period and empty filters.
 *   const r = useReportPeriod({ prdNo: '' })
 *   <ReportFilterBar {...r.barProps} loading={loading} filters={[... r.filters.prdNo, r.setFilter('prdNo') ...]} />
 *   useEffect(() => load(r.applied), [r.applied])
 */
export default function useReportPeriod(emptyFilters = {}) {
  const initial = periodRange(DEFAULT_PERIOD)
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [filters, setFilters] = useState(emptyFilters)
  const [applied, setApplied] = useState({ ...initial, ...emptyFilters })

  function onPeriodChange(value) {
    setPeriod(value)
    const range = periodRange(value)
    if (range) {
      setFrom(range.from)
      setTo(range.to)
    }
  }

  function onReset() {
    const range = periodRange(DEFAULT_PERIOD)
    setPeriod(DEFAULT_PERIOD)
    setFrom(range.from)
    setTo(range.to)
    setFilters(emptyFilters)
    setApplied({ ...range, ...emptyFilters })
  }

  return {
    filters,
    applied,
    setFilter: (key) => (value) => setFilters((f) => ({ ...f, [key]: value })),
    barProps: {
      period,
      from,
      to,
      onPeriodChange,
      onFromChange: (v) => { setFrom(v); setPeriod('custom') },
      onToChange: (v) => { setTo(v); setPeriod('custom') },
      onSearch: () => setApplied({ from, to, ...filters }),
      onReset,
    },
  }
}
