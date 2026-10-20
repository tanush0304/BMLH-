import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { Settings, Hourglass, PieChart as PieIcon, BarChart3, TrendingUp } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK, DonutChart } from '../../components/reports/ChartCard'
import ReportTable from '../../components/reports/ReportTable'
import { listProductionHours, listProductionSetup } from '../../data/queries/reports'
import { listMachines } from '../../data/queries/machines'
import { listShifts } from '../../data/queries/shifts'
import { machineOptionLabel } from '../../utils/machineLabel'
import { daysBetween, shortDate, displayDate } from '../../utils/reportPeriods'
import { monthLabel } from '../../utils/reportOrders'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { machineRows, downtimeSummary, downtimeTrend, DOWNTIME_TYPES, round1, trendBuckets } from '../../utils/reportAggregates'

const EMPTY_FILTERS = { machineId: '', shiftCode: '' }

// One colour per downtime type, in DOWNTIME_TYPES order.
const TYPE_COLORS = ['#1669E0', '#F08C1A', '#16A34A', '#7C3AED', '#DC2626', '#0F9F8F', '#EAB308', '#64748B']

const hrs = (min) => round1(min / 60)
const fmtHrs = (v) => (v == null ? '—' : v.toFixed(1))
const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(1)} %`)

/**
 * Downtime Report: hours lost by type (setting time + the 7 idle categories
 * from the hourly report) against hours available.
 *   available = logged hour rows x 60 min - lunch     (lunch = planned break)
 *   lost      = 7 idle categories (no lunch) + setting time
 * Setting time is per log ("report production setup", 029), on the log's own
 * date + shift. Manual Operations logs (no machine) are left out.
 */
export default function DowntimeScreen() {
  const chartType = useChartType()
  const r = useReportPeriod(EMPTY_FILTERS)
  const { applied, filters } = r

  const [hourRows, setHourRows] = useState([])
  const [setupRows, setSetupRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [options, setOptions] = useState({ machines: [], shifts: [] })

  useEffect(() => {
    Promise.all([listMachines(), listShifts()])
      .then(([machines, shifts]) => setOptions({ machines, shifts }))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([listProductionHours(applied), listProductionSetup(applied)])
      .then(([hours, setup]) => {
        if (cancelled) return
        setHourRows(machineRows(hours))
        setSetupRows(machineRows(setup))
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [applied])

  const summary = useMemo(() => downtimeSummary(hourRows, setupRows), [hourRows, setupRows])
  const trend = useMemo(
    () => trendBuckets(downtimeTrend(hourRows, setupRows, daysBetween(applied.from, applied.to)), { sum: DOWNTIME_TYPES.map((t) => t.key), dayLabel: shortDate, monthLabel }),
    [hourRows, setupRows, applied.from, applied.to]
  )
  const typeData = summary.byType.map((t, i) => ({ ...t, hours: hrs(t.lostMin), color: TYPE_COLORS[i] }))

  const availableHrs = hrs(summary.availableMin)
  const tableRows = typeData.map((t) => ({ key: t.key, label: t.label, available: availableHrs, lost: t.hours, pct: t.pct, color: t.color }))
  const totalsRow = { label: 'Total', available: availableHrs, lost: hrs(summary.lostMin), pct: summary.downtime_pct }

  const columns = [
    { key: 'label', label: 'Type of Downtime' },
    { key: 'available', label: 'Total Hours Available (Hrs)', align: 'right', format: fmtHrs },
    { key: 'lost', label: 'Total Hours Lost (Hrs)', align: 'right', format: fmtHrs },
    { key: 'pct', label: 'Downtime %', format: fmtPct, bar: (r) => r.color ?? CHART_COLORS.red },
  ]

  const empty = hourRows.length === 0 && setupRows.length === 0
  const periodText = `${displayDate(applied.from)} to ${displayDate(applied.to)}`

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Downtime Report" subtitle="Right Material | Right Quantity | Right Production" />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={[
            { key: 'machine', label: 'Machine', value: filters.machineId, onChange: r.setFilter('machineId'), options: options.machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) })) },
            { key: 'shift', label: 'Shift', value: filters.shiftCode, onChange: r.setFilter('shiftCode'), options: options.shifts.map((s) => s.shift_code) },
          ]}
        />

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow columns={4}>
          <KpiCard label="Total Hours Available" value={fmtHrs(availableHrs)} unit="Hrs" sub="Logged hours – lunch" icon={Settings} tone="blue" loading={loading} />
          <KpiCard label="Total Hours Lost" value={fmtHrs(hrs(summary.lostMin))} unit="Hrs" icon={Hourglass} tone="red" loading={loading} />
          <KpiCard label="Overall Downtime %" value={summary.downtime_pct == null ? '—' : summary.downtime_pct.toFixed(1)} unit={summary.downtime_pct == null ? '' : '%'} icon={PieIcon} tone="green" loading={loading} />
          <KpiCard label="Machines Monitored" value={formatQty(summary.machines)} icon={BarChart3} tone="purple" loading={loading} />
        </KpiCardRow>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <ChartCard title="Downtime Hours by Type" icon={BarChart3} loading={loading} empty={empty || summary.lostMin === 0} height={260}>
            <ComposedChart data={typeData} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={AXIS_TICK} width={40} />
              <Tooltip formatter={(v) => `${fmtHrs(v)} Hrs`} />
              {series(chartType, {
                key: 'hours',
                dataKey: 'hours',
                name: 'Hours Lost',
                children: [
                  ...typeData.map((t) => <Cell key={t.key} fill={t.color} />),
                  <LabelList key="label" dataKey="hours" position="top" style={{ fontSize: 11 }} formatter={(v) => (v ? v.toFixed(1) : '')} />,
                ],
              })}
            </ComposedChart>
          </ChartCard>

          <ChartCard title="Downtime % by Type" icon={PieIcon} loading={loading} empty={empty || summary.lostMin === 0} height={260} raw>
            <DonutChart
              data={typeData.map((t) => ({ key: t.key, label: t.label, value: t.lostMin, color: t.color }))}
              centre={{ caption: 'Total', total: fmtHrs(hrs(summary.lostMin)), unit: 'Hrs Lost' }}
              tooltip={(d) => `${fmtHrs(hrs(d.value))} Hrs`}
            />
          </ChartCard>

          <ChartCard title="Trend of Downtime Hours" icon={TrendingUp} loading={loading} empty={empty} height={260}>
            <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} minTickGap={12} />
              <YAxis tick={AXIS_TICK} width={40} />
              <Tooltip formatter={(v) => `${fmtHrs(v)} Hrs`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {DOWNTIME_TYPES.map((t, i) => series(chartType, { key: t.key, dataKey: t.key, name: t.label, color: TYPE_COLORS[i] }))}
            </ComposedChart>
          </ChartCard>
        </div>

        <ReportTable
          title="Downtime Report Details"
          columns={columns}
          rows={tableRows}
          totalsRow={totalsRow}
          loading={loading}
          error={null}
          rowKey="key"
          searchKeys={['label']}
          searchPlaceholder="Search by type of downtime..."
          exportTitle={`Downtime Report – ${periodText}`}
          exportName="downtime_report"
        />
      </div>
    </div>
  )
}
