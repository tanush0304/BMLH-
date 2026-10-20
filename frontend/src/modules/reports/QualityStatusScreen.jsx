import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea, ReferenceLine } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { FileText, CircleCheck, CircleX, CircleHelp, BarChart3, TrendingUp, PieChart as PieIcon, Ruler } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK, DonutChart } from '../../components/reports/ChartCard'
import ReportTable, { ReportBadge } from '../../components/reports/ReportTable'
import { listQualityInspections, listReadingsForLogs, listProductionHours } from '../../data/queries/reports'
import { listOrdersByPrd } from '../../data/queries/customerOrders'
import { listMachines } from '../../data/queries/machines'
import { listShifts } from '../../data/queries/shifts'
import { listEmployees } from '../../data/queries/employees'
import { machineOptionLabel } from '../../utils/machineLabel'
import { sortedEmployeeOptions, employeeLabelForId } from '../../utils/employeeLabel'
import { listQualityParameters } from '../../data/queries/qualityParameters'
import { stageLabel } from '../../utils/stageLabel'
import { daysBetween, shortDate, displayDate } from '../../utils/reportPeriods'
import { monthLabel } from '../../utils/reportOrders'
import { inspectionCounts, qualityTrend, toleranceBand, parameterSeries, piecesByInspectionKey, inspectionKey } from '../../utils/reportQuality'

const RESULT_TONES = { OK: 'green', NG: 'red', Accepted: 'green', Rejected: 'red', 'No readings': 'amber' }
const pctText = (v) => (v == null ? '' : `(${v.toFixed(1)}%)`)
const fmtNum = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }))
const SELECT = 'input-dropdown min-w-0 max-w-[140px] rounded border px-2 py-1 text-[12px] focus:outline-none'

/**
 * Quality Status Report from "report quality inspections" (029). KPIs count
 * inspections (an inspection is Accepted only if every reading passes; "No
 * readings" when it has none) -- no Rework (quality logs hold no piece
 * counts). Yield = Accepted / inspections with readings. Table = one row per
 * reading (Target = standard, tolerance band, Actual, OK / NG) plus the
 * production pieces logged for that PRD + stage + date + shift. Parameter
 * chart: one part + one parameter, observed values against the tolerance band.
 */
export default function QualityStatusScreen() {
  const chartType = useChartType()
  const r = useReportPeriod({ prdNo: '', parameter: '', machineId: '', shiftCode: '', employeeId: '' })
  const [inspections, setInspections] = useState([])
  const [readings, setReadings] = useState([])
  const [hours, setHours] = useState([])
  const [opts, setOpts] = useState({ orders: [], machines: [], shifts: [], employees: [], qualityParams: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chartPart, setChartPart] = useState('')
  const [chartParam, setChartParam] = useState('')

  useEffect(() => {
    Promise.all([listOrdersByPrd(), listMachines(), listShifts(), listEmployees(), listQualityParameters()])
      .then(([orders, machines, shifts, employees, qualityParams]) => setOpts({ orders, machines, shifts, employees, qualityParams }))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const { from, to, prdNo, machineId, shiftCode } = r.applied
    listQualityInspections(r.applied)
      .then(async (insp) => {
        const [rd, hrs] = await Promise.all([
          listReadingsForLogs(insp.map((i) => i.quality_log_id)),
          listProductionHours({ from, to, prdNo, machineId, shiftCode }),
        ])
        if (cancelled) return
        setInspections(insp)
        setReadings(rd)
        setHours(hrs)
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [r.applied])

  const partForPrd = useMemo(() => {
    const m = new Map(opts.orders.map((o) => [o.prd_no, o.part_serial_number]))
    return (prd) => m.get(prd) ?? ''
  }, [opts.orders])

  // Parameter filter: inspections that measured it, and only its readings.
  const param = r.applied.parameter
  const scopedReadings = useMemo(() => (param ? readings.filter((x) => x.quality_parameter === param) : readings), [readings, param])
  const scopedInspections = useMemo(() => {
    if (!param) return inspections
    const ids = new Set(scopedReadings.map((x) => x.quality_log_id))
    return inspections.filter((i) => ids.has(i.quality_log_id))
  }, [inspections, scopedReadings, param])

  const counts = inspectionCounts(scopedInspections)
  const trend = useMemo(
    () => qualityTrend(scopedInspections, daysBetween(r.applied.from, r.applied.to), { dayLabel: shortDate, monthLabel }),
    [scopedInspections, r.applied]
  )
  const donut = [
    { key: 'Accepted', label: 'Accepted', value: counts.accepted, color: CHART_COLORS.green },
    { key: 'Rejected', label: 'Rejected', value: counts.rejected, color: CHART_COLORS.red },
    { key: 'No readings', label: 'No readings', value: counts.noReadings, color: CHART_COLORS.amber },
  ]

  // Parameter chart: part + parameter pickers (defaults: first available).
  const inspectionById = useMemo(() => new Map(inspections.map((i) => [i.quality_log_id, i])), [inspections])
  const partParams = useMemo(() => {
    const m = new Map()
    for (const x of readings) {
      const i = inspectionById.get(x.quality_log_id)
      if (!i) continue
      const part = partForPrd(i.prd_no)
      if (!m.has(part)) m.set(part, new Set())
      m.get(part).add(x.quality_parameter)
    }
    return m
  }, [readings, inspectionById, partForPrd])
  const parts = [...partParams.keys()].filter(Boolean).sort()
  const part = parts.includes(chartPart) ? chartPart : parts[0] ?? ''
  const paramsForPart = [...(partParams.get(part) ?? [])].sort()
  const chartParameter = paramsForPart.includes(chartParam) ? chartParam : (param && paramsForPart.includes(param) ? param : paramsForPart[0] ?? '')
  // Not `series`: that name is the Bar/Line helper imported above.
  const paramSeries = useMemo(
    () => parameterSeries(readings, inspectionById, partForPrd, part, chartParameter).map((p, n) => ({ ...p, n: n + 1, label: shortDate(p.date) })),
    [readings, inspectionById, partForPrd, part, chartParameter]
  )
  const band = paramSeries.find((p) => p.min != null)
  const yDomain = useMemo(() => {
    const vals = paramSeries.flatMap((p) => [p.observed, p.min, p.max]).filter((v) => v != null)
    if (vals.length === 0) return ['auto', 'auto']
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.25
    return [lo - pad, hi + pad]
  }, [paramSeries])

  // Table: one row per reading; an inspection without readings gets one row.
  const pieces = useMemo(() => piecesByInspectionKey(hours), [hours])
  const rows = useMemo(() => {
    const byLog = new Map()
    for (const x of scopedReadings) {
      if (!byLog.has(x.quality_log_id)) byLog.set(x.quality_log_id, [])
      byLog.get(x.quality_log_id).push(x)
    }
    const out = []
    for (const i of scopedInspections) {
      const base = {
        prd_no: i.prd_no,
        stage: stageLabel({ seq: i.stage_seq, position: i.stage_position, operation: i.operation }),
        machine: i.machine_id ? `${i.machine_name ?? ''} (${i.machine_id})` : '—',
        machine_category: i.machine_category,
        log_date: i.log_date,
        shift_code: i.shift_code,
        employee: employeeLabelForId(i.employee_id, opts.employees) || '—',
        inspection_result: i.inspection_result,
        pieces: pieces.get(inspectionKey(i)) ?? null,
      }
      const list = byLog.get(i.quality_log_id) ?? []
      if (list.length === 0) out.push({ ...base, key: `${i.quality_log_id}-none`, parameter: '—', result: null })
      for (const x of list) {
        const b = toleranceBand(x)
        out.push({
          ...base,
          key: `${i.quality_log_id}-${x.reading_id}`,
          parameter: x.quality_parameter,
          target: x.standard,
          tolerance: b ? `${fmtNum(b.min)} – ${fmtNum(b.max)}` : '—',
          actual: x.observed_value,
          result: x.result === 'Accepted' ? 'OK' : x.result === 'Not Accepted' ? 'NG' : null,
        })
      }
    }
    return out
  }, [scopedInspections, scopedReadings, pieces, opts.employees])

  const prdOptions = [...new Set(opts.orders.map((o) => o.prd_no).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  // With a Machine picked: every parameter Quality Master defines for that
  // machine; otherwise the parameters measured in the loaded inspections.
  const paramOptions = [
    ...new Set(
      r.filters.machineId
        ? opts.qualityParams.filter((p) => p.machine_id === r.filters.machineId).map((p) => p.quality_parameter)
        : readings.map((x) => x.quality_parameter)
    ),
  ].filter(Boolean).sort()

  const columns = [
    { key: 'prd_no', label: 'PRD No' },
    { key: 'stage', label: 'Type of Operation' },
    { key: 'machine', label: 'Machine' },
    { key: 'machine_category', label: 'Type of Machine' },
    { key: 'log_date', label: 'Date', format: displayDate },
    { key: 'shift_code', label: 'Shift' },
    { key: 'employee', label: 'Inspected By' },
    { key: 'parameter', label: 'Quality Parameter' },
    { key: 'target', label: 'Target', align: 'right', format: fmtNum },
    { key: 'tolerance', label: 'Tolerance Band' },
    { key: 'actual', label: 'Actual', align: 'right', format: fmtNum },
    { key: 'result', label: 'Result', format: (v) => v ?? '—', render: (row) => (row.result ? <ReportBadge status={row.result} tones={RESULT_TONES} /> : '—') },
    { key: 'inspection_result', label: 'Inspection Result', render: (row) => <ReportBadge status={row.inspection_result} tones={RESULT_TONES} /> },
    { key: 'pieces', label: 'Production Pieces (Produced / Rejected)', align: 'right', format: (v) => (v ? `${formatQty(v.produced)} / ${formatQty(v.rejected)}` : '—') },
  ]

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Quality Status Report" subtitle="Right Material | Right Quantity | Right Production" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={[
            { key: 'prd', label: 'PRD No', value: r.filters.prdNo, onChange: r.setFilter('prdNo'), options: prdOptions },
            {
              key: 'machine',
              label: 'Machine',
              value: r.filters.machineId,
              // A new machine has its own parameter list: clear the old pick.
              onChange: (v) => { r.setFilter('machineId')(v); r.setFilter('parameter')('') },
              options: opts.machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) })),
            },
            { key: 'param', label: 'Quality Parameter', allLabel: 'Parameter', value: r.filters.parameter, onChange: r.setFilter('parameter'), options: paramOptions },
            { key: 'shift', label: 'Shift', value: r.filters.shiftCode, onChange: r.setFilter('shiftCode'), options: opts.shifts.map((s) => s.shift_code) },
            { key: 'operator', label: 'Operator', value: r.filters.employeeId, onChange: r.setFilter('employeeId'), options: sortedEmployeeOptions(opts.employees) },
          ]}
        />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow columns={5}>
          <KpiCard label="Total Inspections" value={formatQty(counts.total)} icon={FileText} tone="blue" loading={loading} />
          <KpiCard label="Accepted" value={formatQty(counts.accepted)} unit={pctText(counts.acceptedPct)} icon={CircleCheck} tone="green" loading={loading} />
          <KpiCard label="Rejected" value={formatQty(counts.rejected)} unit={pctText(counts.rejectedPct)} icon={CircleX} tone="red" loading={loading} />
          <KpiCard label="No Readings" value={formatQty(counts.noReadings)} unit={pctText(counts.noReadingsPct)} icon={CircleHelp} tone="orange" loading={loading} />
          <KpiCard label="Overall Quality Yield" value={counts.yield_pct == null ? '—' : counts.yield_pct.toFixed(1)} unit={counts.yield_pct == null ? '' : '%'} sub="Accepted ÷ inspected with readings" icon={BarChart3} tone="purple" loading={loading} />
        </KpiCardRow>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <ChartCard title="Inspection Result Trend" icon={TrendingUp} loading={loading} empty={counts.total === 0} height={270}>
            <ComposedChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} minTickGap={12} />
              <YAxis yAxisId="n" tick={AXIS_TICK} width={32} allowDecimals={false} />
              <YAxis yAxisId="y" orientation="right" tick={AXIS_TICK} width={40} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v, name) => (name === 'Yield %' ? (v == null ? '—' : `${v}%`) : v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series(chartType, { key: 'accepted', yAxisId: 'n', dataKey: 'accepted', name: 'Accepted', stackId: 'i', color: CHART_COLORS.green })}
              {series(chartType, { key: 'rejected', yAxisId: 'n', dataKey: 'rejected', name: 'Rejected', stackId: 'i', color: CHART_COLORS.red })}
              {series(chartType, { key: 'noReadings', yAxisId: 'n', dataKey: 'noReadings', name: 'No readings', stackId: 'i', color: CHART_COLORS.amber })}
              <Line yAxisId="y" dataKey="yield_pct" name="Yield %" stroke={CHART_COLORS.blue} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ChartCard>

          <ChartCard title="Quality Status (Overall)" icon={PieIcon} loading={loading} empty={counts.total === 0} height={270} raw>
            <DonutChart
              data={donut}
              centre={{ caption: 'Total', total: formatQty(counts.total), unit: 'Inspections' }}
              legendValue={(d, share) => `${formatQty(d.value)} (${share}%)`}
              tooltip={(d) => `${d.value} inspections`}
            />
          </ChartCard>

          <ChartCard
            title="Parameter Analysis"
            icon={Ruler}
            loading={loading}
            empty={paramSeries.length === 0}
            height={270}
            actions={
              <div className="flex gap-1.5">
                <select aria-label="Chart part" className={SELECT} value={part} onChange={(e) => { setChartPart(e.target.value); setChartParam('') }}>
                  {parts.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select aria-label="Chart parameter" className={SELECT} value={chartParameter} onChange={(e) => setChartParam(e.target.value)}>
                  {paramsForPart.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            }
          >
            <ComposedChart data={paramSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="n" tick={AXIS_TICK} tickFormatter={(n) => paramSeries[n - 1]?.label ?? ''} minTickGap={12} />
              <YAxis tick={AXIS_TICK} width={52} domain={yDomain} tickFormatter={fmtNum} />
              <Tooltip labelFormatter={(n) => displayDate(paramSeries[n - 1]?.date)} formatter={(v, name) => [fmtNum(v), name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {band && <ReferenceArea y1={band.min} y2={band.max} fill={CHART_COLORS.green} fillOpacity={0.15} stroke="none" />}
              {band && <ReferenceLine y={band.max} stroke={CHART_COLORS.red} strokeDasharray="4 3" label={{ value: 'Upper', position: 'insideTopRight', fontSize: 10, fill: CHART_COLORS.red }} />}
              {band && <ReferenceLine y={band.min} stroke={CHART_COLORS.red} strokeDasharray="4 3" label={{ value: 'Lower', position: 'insideBottomRight', fontSize: 10, fill: CHART_COLORS.red }} />}
              {band && <ReferenceLine y={band.std} stroke={CHART_COLORS.green} />}
              <Line
                dataKey="observed"
                name={`${chartParameter} (observed)`}
                stroke={CHART_COLORS.blue}
                strokeWidth={2}
                dot={(props) => <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={props.payload.result === 'Not Accepted' ? CHART_COLORS.red : CHART_COLORS.blue} />}
              />
            </ComposedChart>
          </ChartCard>
        </div>

        <ReportTable
          title="Quality Status Details"
          columns={columns}
          rows={rows}
          loading={loading}
          error={null}
          rowKey="key"
          searchKeys={['prd_no', 'stage', 'machine', 'employee', 'parameter', 'inspection_result']}
          searchPlaceholder="Search by PRD No / Operation / Machine / Parameter..."
          exportTitle={`Quality Status Report – ${displayDate(r.applied.from)} to ${displayDate(r.applied.to)}`}
          exportName="quality_status_report"
        />
      </div>
    </div>
  )
}
