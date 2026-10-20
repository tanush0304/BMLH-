import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { BarChart3, Target, ShieldX, Cog } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportDayBar from '../../components/reports/ReportDayBar'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK, categoryColor, categoryLineColor } from '../../components/reports/ChartCard'
import ReportTable from '../../components/reports/ReportTable'
import { listProductionHours } from '../../data/queries/reports'
import { listMachines } from '../../data/queries/machines'
import { todayISO } from '../../utils/dates'
import { addDays, shortDate, displayDate } from '../../utils/reportPeriods'
import { machineRows, totals, dailyCategoryMatrix, machineCategories, machineView, changePct, changePoints } from '../../utils/reportAggregates'
import { Field } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import { machineOptionLabel } from '../../utils/machineLabel'

const DAYS_SHOWN = 5

const fmtPct = (v) => (v == null ? '—' : v.toFixed(1))
// Display-only thresholds, same as Production Status -- confirm with senior.
const effClass = (v) => (v == null ? '' : v >= 90 ? 'bg-green-100' : v >= 80 ? 'bg-amber-100' : 'bg-red-100')
const rejClass = (v) => (v == null ? '' : v <= 2 ? 'bg-green-100' : v <= 5 ? 'bg-amber-100' : 'bg-red-100')

/**
 * Daily Machine Wise Dashboard: the chosen date's production / efficiency /
 * rejects vs the day before, a 5-day chart per machine category
 * (`"machines master".category`), and a date x category summary table.
 * Manual Operations logs (no machine) are left out.
 */
export default function DailyMachineScreen() {
  const chartType = useChartType()
  const [date, setDate] = useState(todayISO())
  const [reloadKey, setReloadKey] = useState(0)
  const [allRows, setRows] = useState([])
  // Machine filter: '' = All (one card per category, as before).
  const [machineId, setMachineId] = useState('')
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listMachines().then(setMachines).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listProductionHours({ from: addDays(date, -(DAYS_SHOWN - 1)), to: date })
      .then((data) => !cancelled && setRows(machineRows(data)))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [date, reloadKey])

  const allCategories = useMemo(() => {
    const fromMaster = machineCategories(machines)
    // A category only in the logs (e.g. a machine since recategorised) still shows.
    for (const r of allRows) if (!fromMaster.includes(r.machine_category)) fromMaster.push(r.machine_category)
    return fromMaster
  }, [machines, allRows])
  const { rows, categories } = useMemo(() => machineView(allRows, allCategories, machines, machineId), [allRows, allCategories, machines, machineId])
  const selectedMachine = machines.find((m) => m.machine_id === machineId)

  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(date, i - (DAYS_SHOWN - 1))), [date])
  const matrix = useMemo(() => dailyCategoryMatrix(rows, days, categories), [rows, days, categories])

  const today = useMemo(() => totals(rows.filter((r) => r.log_date === date)), [rows, date])
  const yesterday = useMemo(() => totals(rows.filter((r) => r.log_date === addDays(date, -1))), [rows, date])

  const categoryCounts = useMemo(() => {
    const counts = new Map()
    for (const m of machines) {
      const c = m.category || 'Uncategorised'
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return [...counts]
  }, [machines])

  const tableRows = useMemo(
    () =>
      matrix.map((d) => {
        const row = { date: d.date }
        categories.forEach((c, i) => {
          const t = d.byCategory[c]
          row[`c${i}_produced`] = t.produced
          row[`c${i}_eff`] = t.efficiency_pct
          row[`c${i}_rej`] = t.reject_pct
        })
        row.total_produced = d.total.produced
        row.total_eff = d.total.efficiency_pct
        row.total_rej = d.total.reject_pct
        return row
      }),
    [matrix, categories]
  )

  const metricCols = (prefix) => [
    { key: `${prefix}_produced`, label: 'Production (Nos)', align: 'right', format: formatQty },
    { key: `${prefix}_eff`, label: 'Efficiency %', align: 'right', format: fmtPct, cellClass: effClass },
    { key: `${prefix}_rej`, label: 'Reject %', align: 'right', format: fmtPct, cellClass: rejClass },
  ]
  const columns = [
    { key: 'date', label: 'Date', format: displayDate },
    ...categories.flatMap((_, i) => metricCols(`c${i}`)),
    ...metricCols('total'),
  ]
  const groupHeaders = [{ label: '', span: 1 }, ...categories.map((c) => ({ label: c, span: 3 })), { label: 'Total', span: 3 }]

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Daily Machine Wise Dashboard" subtitle="Right Material | Right Quantity | Right Production" />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportDayBar date={date} onDateChange={setDate} onRefresh={() => setReloadKey((k) => k + 1)} loading={loading}>
          <Field label="Machine" width="short" className="max-w-[260px]">
            <SearchableSelect
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              options={machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) }))}
              placeholder="All Machines"
              aria-label="Machine"
            />
          </Field>
        </ReportDayBar>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow columns={4}>
          <KpiCard
            label="Total Production"
            value={formatQty(today.produced)}
            unit="Nos"
            delta={{ value: changePct(today.produced, yesterday.produced), caption: 'vs Yesterday' }}
            icon={BarChart3}
            tone="blue"
            loading={loading}
          />
          <KpiCard
            label="Average Production Efficiency"
            value={today.efficiency_pct == null ? '—' : `${today.efficiency_pct.toFixed(1)}%`}
            delta={{ value: changePoints(today.efficiency_pct, yesterday.efficiency_pct), unit: ' pts', caption: 'vs Yesterday' }}
            icon={Target}
            tone="green"
            loading={loading}
          />
          <KpiCard
            label="Total Reject Quantity"
            value={formatQty(today.rejected)}
            unit="Nos"
            delta={{ value: changePct(today.rejected, yesterday.rejected), caption: 'vs Yesterday', higherIsBetter: false }}
            icon={ShieldX}
            tone="red"
            loading={loading}
          />
          <KpiCard
            label="Total Machines"
            value={formatQty(machines.length)}
            icon={Cog}
            tone="orange"
            side={
              <table className="text-[12px] text-slate-700">
                <tbody>
                  {categoryCounts.map(([c, n]) => (
                    <tr key={c}>
                      <td className="pr-3">{c}</td>
                      <td className="text-right font-semibold">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </KpiCardRow>

        {/* One card per category in the data; up to 4 per row on wide screens. */}
        <div className={`grid grid-cols-1 gap-2 md:grid-cols-2 ${categories.length >= 4 ? 'xl:grid-cols-4' : categories.length === 3 ? 'xl:grid-cols-3' : ''}`}>
          {categories.map((c, i) => {
            // Keep each category's colour when a machine narrows the view.
            const ci = Math.max(0, allCategories.indexOf(c))
            const colour = categoryColor(ci)
            const lineColour = categoryLineColor(ci)
            const data = matrix.map((d) => ({ label: shortDate(d.date), produced: d.byCategory[c].produced, efficiency: d.byCategory[c].efficiency_pct }))
            return (
              <ChartCard key={c} title={selectedMachine ? `${machineOptionLabel(selectedMachine)} · ${c}` : c} headerColor={colour} loading={loading} empty={data.every((d) => d.produced === 0)} height={230}>
                <ComposedChart data={data} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis yAxisId="qty" tick={AXIS_TICK} width={40} allowDecimals={false} />
                  <YAxis yAxisId="eff" orientation="right" tick={AXIS_TICK} width={40} unit="%" />
                  <Tooltip formatter={(v, name) => (name === 'Efficiency %' ? (v == null ? '—' : `${v}%`) : formatQty(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {series(chartType, {
                    key: 'produced',
                    yAxisId: 'qty',
                    dataKey: 'produced',
                    name: 'Production (Nos)',
                    color: colour,
                    children: <LabelList dataKey="produced" position="top" style={{ fontSize: 11 }} formatter={(v) => (v ? v : '')} />,
                  })}
                  <Line yAxisId="eff" dataKey="efficiency" name="Efficiency %" stroke={lineColour} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ChartCard>
            )
          })}
        </div>

        <ReportTable
          title="Daily Machine Wise Production Summary"
          columns={columns}
          groupHeaders={groupHeaders}
          showSerial={false}
          rows={tableRows}
          loading={loading}
          error={null}
          rowKey="date"
          searchKeys={['date']}
          searchPlaceholder="Search by date (YYYY-MM-DD)..."
          exportTitle={`Daily Machine Wise Production Summary – ${displayDate(days[0])} to ${displayDate(date)}`}
          exportName="daily_machine_summary"
        />
      </div>
    </div>
  )
}
