import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { FileText, Settings, Hourglass, Truck, BarChart3, PieChart as PieIcon, Users } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK, DonutChart } from '../../components/reports/ChartCard'
import ReportTable, { ReportBadge } from '../../components/reports/ReportTable'
import { listJobOrderStatusRows } from '../../data/queries/reports'
import { listVendors } from '../../data/queries/vendors'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import { todayISO } from '../../utils/dates'
import { displayDate } from '../../utils/reportPeriods'
import { jobOrderRows, jobOrderCounts, dcTableStatusLabel, dcStatusCellText } from '../../utils/reportOrders'
import { topN } from '../../utils/reportStock'

const STATUS_TONES = { Received: 'green', 'Closed Short': 'slate', 'Partially Received': 'blue', Sent: 'amber', Overdue: 'red' }
const pctText = (v) => (v == null ? '' : `(${v.toFixed(0)}%)`)

/**
 * Job Order Status Report from "job order status" (migration 031: one row
 * per DC, so a stage split across two vendors shows two rows), for DCs
 * dispatched in the period. Status: Sent / Partially Received / Received /
 * Closed Short; Overdue = open DC past its expected receipt date (a flag,
 * shown next to the status). Pending qty = balance still out on open DCs;
 * Short Qty = sent - received on a Closed Short DC. Standard lead time from
 * Job Work Master. Filters: PRD, Vendor, Type of Operation (job work type).
 */
export default function JobOrderStatusScreen() {
  const chartType = useChartType()
  const r = useReportPeriod({ prdNo: '', vendorId: '', jobWorkCode: '' })
  const [raw, setRaw] = useState([])
  const [vendors, setVendors] = useState([])
  const [jobWorkTypes, setJobWorkTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([listVendors(), listJobWorkTypes()])
      .then(([v, j]) => { setVendors(v); setJobWorkTypes(j) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listJobOrderStatusRows(r.applied)
      .then((data) => !cancelled && setRaw(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [r.applied])

  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.vendor_id, v.vendor_name])), [vendors])
  const jobWork = useMemo(() => new Map(jobWorkTypes.map((j) => [j.job_work_code, j])), [jobWorkTypes])

  const rows = useMemo(() => {
    const { prdNo, vendorId, jobWorkCode } = r.applied
    const scoped = raw.filter((x) => (!prdNo || x.prd_no === prdNo) && (!vendorId || x.vendor_id === vendorId) && (!jobWorkCode || x.job_work_code === jobWorkCode))
    return jobOrderRows(scoped, todayISO()).map((x) => ({
      ...x,
      vendor_name: vendorName.get(x.vendor_id) ?? x.vendor_id,
      operation: jobWork.get(x.job_work_code)?.type_of_job_work ?? x.job_work_code,
      std_lead: jobWork.get(x.job_work_code)?.lead_time_days ?? null,
    }))
  }, [raw, r.applied, vendorName, jobWork])

  const counts = jobOrderCounts(rows)

  const byOperation = useMemo(() => {
    const m = new Map()
    for (const x of rows) {
      const t = m.get(x.operation) ?? { label: x.operation, dispatched: 0, pending: 0 }
      t.dispatched += x.qty
      t.pending += x.pending
      m.set(x.operation, t)
    }
    return [...m.values()].sort((a, b) => b.dispatched - a.dispatched)
  }, [rows])

  const byVendor = useMemo(() => {
    const m = new Map()
    for (const x of rows) m.set(x.vendor_name, (m.get(x.vendor_name) ?? 0) + x.pending)
    return topN([...m].map(([label, value]) => ({ label, value })), 5).filter((x) => x.label !== 'Others')
  }, [rows])

  const donut = [
    { key: 'Received', label: 'Received', value: counts.received, color: CHART_COLORS.green },
    { key: 'Closed Short', label: dcTableStatusLabel('Closed Short'), value: counts.closedShort, color: '#64748B' },
    { key: 'Partially Received', label: 'Partially Received', value: counts.partial, color: CHART_COLORS.blue },
    { key: 'Sent', label: 'Sent', value: counts.sent, color: CHART_COLORS.amber },
  ]

  const prdOptions = [...new Set(raw.map((x) => x.prd_no))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const dateText = (v) => (v ? displayDate(v) : '—')

  const columns = [
    { key: 'prd_no', label: 'PRD No' },
    { key: 'dc_no', label: 'Job Order No (DC No)' },
    { key: 'operation', label: 'Type of Operation' },
    { key: 'vendor_name', label: 'Vendor Name' },
    { key: 'qty', label: 'Quantity (Nos)', align: 'right', format: formatQty },
    { key: 'dispatch_date', label: 'Date of Despatch', format: dateText },
    { key: 'std_lead', label: 'Standard Lead Time (Days)', align: 'right', format: formatQty },
    { key: 'expected_receipt_date', label: 'Expected Receipt', format: dateText },
    { key: 'receipt_date', label: 'Date of Receipt', format: dateText },
    { key: 'actual_lead_time_days', label: 'Actual Lead Time (Days)', align: 'right', format: formatQty },
    { key: 'received', label: 'Received (Nos)', align: 'right', format: formatQty },
    { key: 'receipt_nos', label: 'Receipt No(s)', format: (v) => v || '—' },
    { key: 'pending', label: 'Quantity Pending (Nos)', align: 'right', format: formatQty },
    { key: 'short_qty', label: 'Short Qty (Nos)', align: 'right', format: formatQty, cellClass: (v) => (v > 0 ? 'bg-amber-100' : '') },
    {
      key: 'status',
      label: 'Status',
      // Display label only: 'Closed Short' shows as "Partially Received (Closed)" here.
      format: (v, row) => dcStatusCellText(v, row?.overdue),
      render: (row) => (
        <span className="inline-flex flex-wrap gap-1">
          <ReportBadge status={row.status} tones={STATUS_TONES} label={dcTableStatusLabel(row.status)} />
          {row.overdue && <ReportBadge status="Overdue" tones={STATUS_TONES} />}
        </span>
      ),
    },
  ]

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Job Order Status Report" subtitle="Right Material | Right Quantity | Right Production" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={[
            { key: 'prd', label: 'PRD No', value: r.filters.prdNo, onChange: r.setFilter('prdNo'), options: prdOptions },
            { key: 'vendor', label: 'Vendor', value: r.filters.vendorId, onChange: r.setFilter('vendorId'), options: vendors.map((v) => ({ value: v.vendor_id, label: v.vendor_name ?? v.vendor_id })) },
            { key: 'op', label: 'Type of Operation', allLabel: 'Operation', value: r.filters.jobWorkCode, onChange: r.setFilter('jobWorkCode'), options: jobWorkTypes.map((j) => ({ value: j.job_work_code, label: j.type_of_job_work ?? j.job_work_code })) },
          ]}
        />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow columns={4}>
          <KpiCard label="Total Job Orders" value={formatQty(counts.total)} icon={FileText} tone="blue" loading={loading} />
          <KpiCard label="Closed (Received / Short)" value={formatQty(counts.closed)} unit={pctText(counts.closedPct)} icon={Settings} tone="green" loading={loading} />
          <KpiCard label="Pending (Sent / Partial)" value={formatQty(counts.pending)} unit={pctText(counts.pendingPct)} icon={Hourglass} tone="orange" loading={loading} />
          <KpiCard label="Overdue" value={formatQty(counts.overdue)} unit={pctText(counts.overduePct)} icon={Truck} tone="red" loading={loading} />
        </KpiCardRow>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <ChartCard title="Job Orders - Despatched vs Pending" icon={BarChart3} loading={loading} empty={rows.length === 0} height={260}>
            <ComposedChart data={byOperation} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} interval={0} />
              <YAxis tick={AXIS_TICK} width={44} allowDecimals={false} />
              <Tooltip formatter={(v) => `${formatQty(v)} Nos`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series(chartType, {
                key: 'dispatched',
                dataKey: 'dispatched',
                name: 'Quantity Despatched',
                color: CHART_COLORS.green,
                children: <LabelList dataKey="dispatched" position="top" style={{ fontSize: 11, fontWeight: 700 }} formatter={(v) => (v ? formatQty(v) : '')} />,
              })}
              {series(chartType, {
                key: 'pending',
                dataKey: 'pending',
                name: 'Quantity Pending',
                color: CHART_COLORS.blue,
                children: <LabelList dataKey="pending" position="top" style={{ fontSize: 11, fontWeight: 700 }} formatter={(v) => (v ? formatQty(v) : '')} />,
              })}
            </ComposedChart>
          </ChartCard>

          <ChartCard title="Job Order Status (By Count)" icon={PieIcon} loading={loading} empty={rows.length === 0} height={260} raw>
            <DonutChart data={donut} centre={{ caption: 'Total', total: formatQty(counts.total), unit: 'Job Orders' }} legendValue={(d) => formatQty(d.value)} tooltip={(d) => `${d.value} job orders`} />
          </ChartCard>

          <ChartCard title="Top 5 Vendors by Pending Quantity" icon={Users} loading={loading} empty={byVendor.length === 0} height={260}>
            <ComposedChart data={byVendor} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} interval={0} />
              <YAxis tick={AXIS_TICK} width={44} allowDecimals={false} />
              <Tooltip formatter={(v) => `${formatQty(v)} Nos`} />
              {series(chartType, {
                key: 'value',
                dataKey: 'value',
                name: 'Pending Quantity (Nos)',
                color: CHART_COLORS.orange,
                children: <LabelList dataKey="value" position="top" style={{ fontSize: 11, fontWeight: 700 }} formatter={formatQty} />,
              })}
            </ComposedChart>
          </ChartCard>
        </div>

        <ReportTable
          title="Job Order Status Details"
          columns={columns}
          rows={rows}
          loading={loading}
          error={null}
          rowKey="dc_no"
          searchKeys={['prd_no', 'dc_no', 'vendor_name', 'operation', 'status']}
          searchPlaceholder="Search by PRD No / Job Order No / Vendor / Operation..."
          exportTitle={`Job Order Status Report – despatched ${displayDate(r.applied.from)} to ${displayDate(r.applied.to)}`}
          exportName="job_order_status_report"
        />
      </div>
    </div>
  )
}
