import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { ClipboardList, Package, Settings, BarChart3, ShieldX, RefreshCw, TrendingUp, Gauge, Recycle } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK } from '../../components/reports/ChartCard'
import ReportTable from '../../components/reports/ReportTable'
import { listProductionHours, listLoggedPrds } from '../../data/queries/reports'
import { listMachines } from '../../data/queries/machines'
import { listShifts } from '../../data/queries/shifts'
import { listEmployees } from '../../data/queries/employees'
import { machineOptionLabel } from '../../utils/machineLabel'
import { sortedEmployeeOptions } from '../../utils/employeeLabel'
import { stageLabel } from '../../utils/stageLabel'
import { daysBetween, shortDate, displayDate } from '../../utils/reportPeriods'
import { monthLabel } from '../../utils/reportOrders'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { MANUAL_LABEL, pct, trendBuckets, productionStatusRows, productionStatusKpis, dailyTrend, byMachine } from '../../utils/reportAggregates'

const EMPTY_FILTERS = { prdNo: '', machineId: '', shiftCode: '', employeeId: '' }

const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)

// Cell colours (green / amber / red). Thresholds are display-only -- confirm with senior.
const effClass = (v) => (v == null ? '' : v >= 90 ? 'bg-green-100' : v >= 80 ? 'bg-amber-100' : 'bg-red-100')
const lossClass = (v) => (v == null ? '' : v <= 2 ? 'bg-green-100' : v <= 5 ? 'bg-amber-100' : 'bg-red-100')

const COLUMNS = [
  { key: 'prd_no', label: 'PRD No' },
  { key: 'operation', label: 'Type of Operation', format: (_, r) => stageLabel({ seq: r.stage_seq, position: r.stage_position, operation: r.operation }) },
  { key: 'machine_name', label: 'Machine', format: (v, r) => (r.machine_id ? `${v ?? ''} (${r.machine_id})` : r.log_id ? MANUAL_LABEL : '') },
  { key: 'required_qty', label: 'Required Qty (Nos)', align: 'right', format: formatQty },
  { key: 'shift_hours', label: 'Shift Hours (Hrs)', align: 'right', format: formatQty },
  { key: 'cycle_time_min', label: 'Cycle Time (Min)', align: 'right', format: formatQty },
  { key: 'standard', label: 'Standard Qty (Nos)', align: 'right', format: formatQty },
  { key: 'produced', label: 'Qty Produced (Nos)', align: 'right', format: formatQty },
  { key: 'efficiency_pct', label: 'Production Eff %', align: 'right', format: fmtPct, cellClass: effClass },
  { key: 'rejected', label: 'Reject Qty (Nos)', align: 'right', format: formatQty },
  { key: 'reject_pct', label: 'Reject %', align: 'right', format: fmtPct, cellClass: lossClass },
  { key: 'rework', label: 'Rework Qty (Nos)', align: 'right', format: formatQty },
  { key: 'rework_pct', label: 'Rework %', align: 'right', format: fmtPct, cellClass: lossClass },
]

const SEARCH_KEYS = ['prd_no', 'operation', 'machine_name', 'machine_id']

/**
 * Production Status Report: KPIs, daily Produced vs Standard, efficiency and
 * reject/rework by machine, and one detail row per production log, from
 * "report production hours" (029). Filters apply on Search.
 */
export default function ProductionStatusScreen() {
  const chartType = useChartType()
  const r = useReportPeriod(EMPTY_FILTERS)
  const applied = r.applied
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [options, setOptions] = useState({ prds: [], machines: [], shifts: [], employees: [] })

  useEffect(() => {
    Promise.all([listLoggedPrds(), listMachines(), listShifts(), listEmployees()])
      .then(([prds, machines, shifts, employees]) => setOptions({ prds, machines, shifts, employees }))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listProductionHours(applied)
      .then((data) => !cancelled && setRows(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [applied])

  const filters = r.filters
  const setFilter = r.setFilter

  const kpis = useMemo(() => productionStatusKpis(rows), [rows])
  const detail = useMemo(() => productionStatusRows(rows), [rows])
  // Daily, or monthly above 62 days (efficiency recomputed from the month's sums).
  const trend = useMemo(
    () =>
      trendBuckets(dailyTrend(rows, daysBetween(applied.from, applied.to)), { sum: ['produced', 'standard'], dayLabel: shortDate, monthLabel }).map((d) => ({
        ...d,
        efficiency_pct: pct(d.produced, d.standard),
      })),
    [rows, applied.from, applied.to]
  )
  const machines = useMemo(() => byMachine(rows), [rows])
  const totalsRow = useMemo(
    () => ({ prd_no: 'Total', required_qty: kpis.required, standard: kpis.standard, produced: kpis.produced, efficiency_pct: kpis.efficiency_pct, rejected: kpis.rejected, reject_pct: kpis.reject_pct, rework: kpis.rework, rework_pct: kpis.rework_pct }),
    [kpis]
  )

  const empty = rows.length === 0
  const periodText = `${displayDate(applied.from)} to ${displayDate(applied.to)}`

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Production Status Report" subtitle="Right Material | Right Quantity | Right Production" />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={[
            { key: 'prd', label: 'PRD No', value: filters.prdNo, onChange: setFilter('prdNo'), options: options.prds },
            { key: 'machine', label: 'Machine', value: filters.machineId, onChange: setFilter('machineId'), options: options.machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) })) },
            { key: 'shift', label: 'Shift', value: filters.shiftCode, onChange: setFilter('shiftCode'), options: options.shifts.map((s) => s.shift_code) },
            { key: 'operator', label: 'Operator', value: filters.employeeId, onChange: setFilter('employeeId'), options: sortedEmployeeOptions(options.employees) },
          ]}
        />

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow>
          <KpiCard label="Total Production Orders" value={formatQty(kpis.orders)} icon={ClipboardList} tone="blue" loading={loading} />
          <KpiCard label="Total Required Quantity" value={formatQty(kpis.required)} unit="Nos" icon={Package} tone="green" loading={loading} />
          <KpiCard label="Total Produced Quantity" value={formatQty(kpis.produced)} unit="Nos" icon={Settings} tone="orange" loading={loading} />
          <KpiCard label="Overall Production Efficiency" value={kpis.efficiency_pct == null ? '—' : kpis.efficiency_pct.toFixed(1)} unit={kpis.efficiency_pct == null ? '' : '%'} icon={BarChart3} tone="purple" loading={loading} />
          <KpiCard label="Total Reject Quantity" value={formatQty(kpis.rejected)} unit="Nos" sub={`(${fmtPct(kpis.reject_pct)})`} icon={ShieldX} tone="red" loading={loading} />
          <KpiCard label="Total Rework Quantity" value={formatQty(kpis.rework)} unit="Nos" sub={`(${fmtPct(kpis.rework_pct)})`} icon={RefreshCw} tone="teal" loading={loading} />
        </KpiCardRow>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <ChartCard title={`Produced vs Standard (${trend.length && trend[0].date.length === 7 ? 'Monthly' : 'Daily'})`} icon={TrendingUp} loading={loading} empty={empty}>
            <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} minTickGap={12} />
              <YAxis tick={AXIS_TICK} width={48} />
              <Tooltip formatter={(v) => formatQty(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series(chartType, { key: 'standard', dataKey: 'standard', name: 'Standard Qty', color: CHART_COLORS.blue })}
              {series(chartType, { key: 'produced', dataKey: 'produced', name: 'Produced Qty', color: CHART_COLORS.green })}
            </ComposedChart>
          </ChartCard>

          <ChartCard title="Production Efficiency (By Machine)" icon={Gauge} loading={loading} empty={empty}>
            <ComposedChart data={machines} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="machine_name" tick={AXIS_TICK} interval={0} />
              <YAxis tick={AXIS_TICK} width={40} unit="%" />
              <Tooltip formatter={(v) => fmtPct(v)} />
              {series(chartType, {
                key: 'efficiency',
                dataKey: 'efficiency_pct',
                name: 'Efficiency %',
                color: CHART_COLORS.purple,
                children: <LabelList dataKey="efficiency_pct" position="top" formatter={(v) => (v == null ? '' : `${Math.round(v)}%`)} style={{ fontSize: 11 }} />,
              })}
            </ComposedChart>
          </ChartCard>

          <ChartCard title="Reject vs Rework Quantity" icon={Recycle} loading={loading} empty={empty}>
            <ComposedChart data={machines} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="machine_name" tick={AXIS_TICK} interval={0} />
              <YAxis tick={AXIS_TICK} width={40} allowDecimals={false} />
              <Tooltip formatter={(v) => formatQty(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series(chartType, { key: 'rejected', dataKey: 'rejected', name: 'Reject Quantity', color: CHART_COLORS.red })}
              {series(chartType, { key: 'rework', dataKey: 'rework', name: 'Rework Quantity', color: CHART_COLORS.amber })}
            </ComposedChart>
          </ChartCard>
        </div>

        <ReportTable
          title="Production Status Report Details"
          columns={COLUMNS}
          rows={detail}
          totalsRow={totalsRow}
          loading={loading}
          error={null}
          rowKey="log_id"
          searchKeys={SEARCH_KEYS}
          searchPlaceholder="Search by PRD No / Operation / Machine..."
          exportTitle={`Production Status Report – ${periodText}`}
          exportName="production_status_report"
        />
      </div>
    </div>
  )
}
