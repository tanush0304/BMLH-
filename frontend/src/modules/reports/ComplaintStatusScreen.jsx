import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { MessageSquareWarning, CircleAlert, CircleCheck, Users, Bug, Package, Gauge } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK } from '../../components/reports/ChartCard'
import ChartGroup from '../../components/reports/ChartGroup'
import { categoryAxisProps } from '../../utils/categoryAxis'
import ReportTable, { ReportBadge } from '../../components/reports/ReportTable'
import { listComplaintsForReport } from '../../data/queries/reports'
import { listCustomers } from '../../data/queries/customers'
import { displayDate } from '../../utils/reportPeriods'
import { topN } from '../../utils/reportStock'
import { SEVERITY_OPTIONS } from '../../utils/customerComplaints'
import {
  filterComplaints,
  complaintKpis,
  complaintsByCustomer,
  complaintsByDefect,
  complaintsByPart,
  complaintsBySeverity,
  defectLabels,
  normalizeDefect,
} from '../../utils/reportComplaints'
import Banner from '../../components/Banner'
import { seriesExportData, fieldsFilterText } from '../../utils/chartExport'

const SEVERITY_COLORS = { Critical: CHART_COLORS.red, Major: CHART_COLORS.orange, Minor: CHART_COLORS.amber, 'Not set': '#94A3B8' }
const STATUS_TONES = { Open: 'amber', 'Under Investigation': 'blue', 'Action Pending': 'amber', Resolved: 'blue', Closed: 'green' }
const SEVERITY_TONES = { Critical: 'red', Major: 'amber', Minor: 'blue' }
const pctText = (n, total) => (total ? `(${((100 * n) / total).toFixed(1)}%)` : '')

/**
 * Customer Complaint Report from "customer complaints" (027), complaints
 * whose complaint_date is in the period. KPIs: Total; Open = every status
 * except Closed; Closed = 'Closed' only (total = open + closed). Charts by
 * Customer / Defect / Part / Severity follow the page's Bar / Line toggle.
 * Defect is free text: grouped by normalizeDefect (case / spacing variants
 * merged, most common spelling shown) until a defect master exists.
 */
export default function ComplaintStatusScreen() {
  const chartType = useChartType()
  const r = useReportPeriod({ customer: '', severity: '' })
  const [all, setAll] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listCustomers().then(setCustomers).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listComplaintsForReport(r.applied)
      .then((data) => !cancelled && setAll(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [r.applied])

  const customerName = useMemo(() => {
    const m = new Map(customers.map((c) => [c.customer_id, c.customer_name]))
    return (id) => m.get(id) ?? id
  }, [customers])

  const rows = useMemo(() => filterComplaints(all, r.applied), [all, r.applied])
  const kpi = complaintKpis(rows)
  const byCustomer = useMemo(() => topN(complaintsByCustomer(rows, customerName), 8), [rows, customerName])
  const byDefect = useMemo(() => topN(complaintsByDefect(rows), 8), [rows])
  const byPart = useMemo(() => topN(complaintsByPart(rows), 8), [rows])
  const bySeverity = useMemo(() => complaintsBySeverity(rows), [rows])
  const empty = rows.length === 0

  const labels = useMemo(() => defectLabels(rows), [rows])
  const tableRows = rows.map((x) => ({
    ...x,
    customer: customerName(x.customer_id),
    defect: labels[normalizeDefect(x.defect_problem)] ?? '',
  }))

  const columns = [
    { key: 'complaint_no', label: 'Complaint No' },
    { key: 'complaint_date', label: 'Complaint Date', format: displayDate },
    { key: 'customer', label: 'Customer' },
    { key: 'part_serial_number', label: 'Part No' },
    { key: 'defect', label: 'Defect Type', format: (v) => v || '—' },
    { key: 'severity', label: 'Severity', format: (v) => v || '—', render: (row) => (row.severity ? <ReportBadge status={row.severity} tones={SEVERITY_TONES} /> : '—') },
    { key: 'status', label: 'Status', render: (row) => <ReportBadge status={row.status} tones={STATUS_TONES} /> },
  ]

  // One bar/line chart per grouping; `colors` gives per-bar colours (bar mode).
  // X-axis labels: shared rule (utils/categoryAxis.js); the card grows with the axis.
  const axisOf = (data) => categoryAxisProps(data.map((d) => d.label))
  const cardHeight = (data) => 260 + axisOf(data).extraHeight
  const countChart = (data, name, color, colors) => {
    const ax = axisOf(data)
    return (
    <ComposedChart data={data} margin={{ top: 22, right: 8, left: ax.marginLeft, bottom: 0 }}>
      <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
      <XAxis dataKey="label" {...ax.axis} />
      <YAxis tick={AXIS_TICK} width={36} allowDecimals={false} />
      <Tooltip formatter={(v) => `${formatQty(v)} complaints`} />
      {series(chartType, {
        key: 'value',
        dataKey: 'value',
        name,
        color,
        children: [
          ...(colors ? data.map((d) => <Cell key={d.label} fill={colors[d.label] ?? color} />) : []),
          <LabelList key="label" dataKey="value" position="top" style={{ fontSize: 11, fontWeight: 700 }} formatter={(v) => (v ? formatQty(v) : '')} />,
        ],
      })}
    </ComposedChart>
    )
  }

  // Filter bar fields (also give the chart Expand modal its filter line).
  const filterFields = [
    { key: 'customer', label: 'Customer', value: r.filters.customer, onChange: r.setFilter('customer'), options: customers.map((c) => ({ value: c.customer_id, label: c.customer_name ?? c.customer_id })) },
    { key: 'severity', label: 'Severity', allLabel: 'Severitie', value: r.filters.severity, onChange: r.setFilter('severity'), options: SEVERITY_OPTIONS },
  ]
  const chartFilter = fieldsFilterText(r.applied, filterFields, { customer: 'customer', severity: 'severity' })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Customer Complaint Report" subtitle="Capture | Investigate | Resolve | Close" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={filterFields}
        />
        {error && <Banner tone="error" message={error} />}

        <KpiCardRow columns={3}>
          <KpiCard label="Total Complaints" value={formatQty(kpi.total)} icon={MessageSquareWarning} tone="blue" loading={loading} />
          <KpiCard label="Open (not yet Closed)" value={formatQty(kpi.open)} unit={pctText(kpi.open, kpi.total)} icon={CircleAlert} tone="orange" loading={loading} />
          <KpiCard label="Closed" value={formatQty(kpi.closed)} unit={pctText(kpi.closed, kpi.total)} icon={CircleCheck} tone="green" loading={loading} />
        </KpiCardRow>

        <ChartGroup title="Customer Complaint Report" screen="Complaint_Status">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <ChartCard screen="Complaint_Status" exportKey="Complaints_by_Customer" filterText={chartFilter} exportData={seriesExportData(byCustomer, 'label', 'Customer', [{ key: 'value', label: 'Complaints' }])} title="Complaints by Customer" icon={Users} loading={loading} empty={empty} height={cardHeight(byCustomer)}>
            {countChart(byCustomer, 'Complaints', CHART_COLORS.blue)}
          </ChartCard>
          <ChartCard screen="Complaint_Status" exportKey="Complaints_by_Defect" filterText={chartFilter} exportData={seriesExportData(byDefect, 'label', 'Defect Type', [{ key: 'value', label: 'Complaints' }])} title="Complaints by Defect Type" icon={Bug} loading={loading} empty={empty} height={cardHeight(byDefect)}>
            {countChart(byDefect, 'Complaints', CHART_COLORS.purple)}
          </ChartCard>
          <ChartCard screen="Complaint_Status" exportKey="Complaints_by_Part" filterText={chartFilter} exportData={seriesExportData(byPart, 'label', 'Part No', [{ key: 'value', label: 'Complaints' }])} title="Complaints by Part No" icon={Package} loading={loading} empty={empty} height={cardHeight(byPart)}>
            {countChart(byPart, 'Complaints', CHART_COLORS.green)}
          </ChartCard>
          <ChartCard screen="Complaint_Status" exportKey="Complaints_by_Severity" filterText={chartFilter} exportData={seriesExportData(bySeverity, 'label', 'Severity', [{ key: 'value', label: 'Complaints' }])} title="Complaints by Severity" icon={Gauge} loading={loading} empty={empty} height={cardHeight(bySeverity)}>
            {countChart(bySeverity, 'Complaints', CHART_COLORS.red, SEVERITY_COLORS)}
          </ChartCard>
        </div>
        </ChartGroup>

        <ReportTable
          title="Customer Complaint Details"
          columns={columns}
          rows={tableRows}
          loading={loading}
          error={null}
          rowKey="id"
          searchKeys={['complaint_no', 'customer', 'part_serial_number', 'defect', 'severity', 'status']}
          searchPlaceholder="Search by Complaint No / Customer / Part / Defect..."
          exportTitle={`Customer Complaint Report – ${displayDate(r.applied.from)} to ${displayDate(r.applied.to)}`}
          exportName="customer_complaint_report"
        />
      </div>
    </div>
  )
}
