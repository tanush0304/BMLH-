import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { FileText, Package, Truck, BarChart3, CircleCheck, Eye, PieChart as PieIcon } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK, DonutChart } from '../../components/reports/ChartCard'
import ReportTable, { ReportBadge } from '../../components/reports/ReportTable'
import { listOrdersByPoDate, listFgTransactionsUpTo } from '../../data/queries/reports'
import { listProductionOrders } from '../../data/queries/customerOrders'
import { listCustomers } from '../../data/queries/customers'
import { listProducts } from '../../data/queries/products'
import { displayDate } from '../../utils/reportPeriods'
import { orderLines, poSummary, monthsBetween, monthlyPoVsDispatch } from '../../utils/reportOrders'

const STATUS_TONES = { Closed: 'green', Open: 'red' }

/**
 * Customer Order Status Dashboard: order lines with PO date in the period,
 * dispatched qty from FG Dispatch (up to To) and Closed/Open per line
 * (Closed = dispatched >= order qty); a PO is Closed only when all its lines
 * are. Monthly PO qty vs dispatched, open/closed donut by qty. View opens
 * Order Traceability for the PRD. Filter: Customer.
 */
export default function CustomerOrderStatusScreen({ onOpenTraceability }) {
  const chartType = useChartType()
  const r = useReportPeriod({ customerId: '' })
  const [orders, setOrders] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [prdRows, setPrdRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([listCustomers(), listProducts()])
      .then(([c, p]) => { setCustomers(c); setProducts(p) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([listOrdersByPoDate(r.applied), listFgTransactionsUpTo(r.applied.to), listProductionOrders()])
      .then(([o, fg, prds]) => {
        if (cancelled) return
        setOrders(o)
        setPrdRows(prds)
        setDispatches(fg.filter((t) => t.transaction_type === 'Dispatch'))
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [r.applied])

  const customerName = useMemo(() => new Map(customers.map((c) => [c.customer_id, c.customer_name])), [customers])
  const productBySerial = useMemo(() => new Map(products.map((p) => [p.part_serial_number, p])), [products])

  const lines = useMemo(() => {
    const dispatched = new Map()
    for (const d of dispatches) dispatched.set(d.prd_no, (dispatched.get(d.prd_no) ?? 0) + (Number(d.qty) || 0))
    const scoped = orders.filter((o) => !r.applied.customerId || o.customer_id === r.applied.customerId)
    // 030: a PO line's PRDs (one per batch); dispatched = sum over them.
    const prdsByLine = new Map()
    for (const p of prdRows) prdsByLine.set(p.order_line_id, [...(prdsByLine.get(p.order_line_id) ?? []), p.prd_no].sort())
    return orderLines(scoped, dispatched, prdsByLine).map((l) => {
      const p = productBySerial.get(l.part_serial_number)
      return { ...l, customer_name: customerName.get(l.customer_id) ?? l.customer_id, part_name: p?.part_name ?? '', drawing: p?.part_drawing_reference_number ?? '' }
    })
  }, [orders, dispatches, prdRows, r.applied.customerId, customerName, productBySerial])

  const po = useMemo(() => poSummary(lines), [lines])
  const totalQty = lines.reduce((a, l) => a + l.order_qty, 0)
  const totalDispatched = lines.reduce((a, l) => a + l.dispatched, 0)
  const monthly = useMemo(() => monthlyPoVsDispatch(lines, dispatches, monthsBetween(r.applied.from, r.applied.to)), [lines, dispatches, r.applied])

  const donut = [
    { key: 'closed', label: 'Closed', value: po.closedQty, color: CHART_COLORS.green },
    { key: 'open', label: 'Open', value: po.openQty, color: CHART_COLORS.red },
  ]

  const columns = [
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'po_number', label: 'PO Reference' },
    { key: 'part_serial_number', label: 'Part Sl No' },
    { key: 'part_name', label: 'Part Name' },
    { key: 'drawing', label: 'Drawing Ref No' },
    { key: 'order_qty', label: 'PO Qty (Nos)', align: 'right', format: formatQty },
    { key: 'prd_list', label: 'PRDs', format: (v) => v || 'Not planned' },
    { key: 'dispatched', label: 'Quantity Despatched (Nos)', align: 'right', format: formatQty },
    { key: 'status', label: 'Status', render: (row) => <ReportBadge status={row.status} tones={STATUS_TONES} /> },
    {
      key: 'action',
      label: 'Action',
      noExport: true,
      render: (row) => (
        <button
          type="button"
          disabled={!row.prds.length}
          title={row.prds.length ? `Trace ${row.prds[0]}` : 'Not planned yet'}
          onClick={() => onOpenTraceability?.(row.prds[0])}
          className="inline-flex items-center gap-1.5 rounded border border-[#1E5FD0] px-3 py-0.5 text-[12px] font-semibold text-[#1E5FD0] hover:bg-[#E3F0FD]"
        >
          <Eye size={14} /> View
        </button>
      ),
    },
  ]

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Customer Order Status Dashboard" subtitle="Right Material | Right Quantity | Right Production" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={[{ key: 'customer', label: 'Customer', value: r.filters.customerId, onChange: r.setFilter('customerId'), options: customers.map((c) => ({ value: c.customer_id, label: c.customer_name ?? c.customer_id })) }]}
        />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow columns={5}>
          <KpiCard label="Total POs" value={formatQty(po.total)} icon={FileText} tone="blue" loading={loading} />
          <KpiCard label="Total PO Quantity" value={formatQty(totalQty)} unit="Nos" icon={Package} tone="green" loading={loading} />
          <KpiCard label="Total Quantity Despatched" value={formatQty(totalDispatched)} unit="Nos" icon={Truck} tone="orange" loading={loading} />
          <KpiCard label="Open POs" value={formatQty(po.open)} sub={`PO Qty: ${formatQty(po.openQty)} Nos`} icon={BarChart3} tone="purple" loading={loading} />
          <KpiCard label="Closed POs" value={formatQty(po.closed)} sub={`PO Qty: ${formatQty(po.closedQty)} Nos`} icon={CircleCheck} tone="red" loading={loading} />
        </KpiCardRow>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ChartCard title="PO Order Vs Qty Despatch (Monthly)" icon={BarChart3} loading={loading} empty={lines.length === 0} height={270}>
              <ComposedChart data={monthly} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} width={48} allowDecimals={false} />
                <Tooltip formatter={(v) => `${formatQty(v)} Nos`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series(chartType, {
                  key: 'po',
                  dataKey: 'po',
                  name: 'PO Quantity',
                  color: CHART_COLORS.blue,
                  children: <LabelList dataKey="po" position="top" style={{ fontSize: 11, fontWeight: 700 }} formatter={(v) => (v ? formatQty(v) : '')} />,
                })}
                {series(chartType, {
                  key: 'dispatched',
                  dataKey: 'dispatched',
                  name: 'Quantity Despatched',
                  color: CHART_COLORS.green,
                  children: <LabelList dataKey="dispatched" position="top" style={{ fontSize: 11, fontWeight: 700 }} formatter={(v) => (v ? formatQty(v) : '')} />,
                })}
              </ComposedChart>
            </ChartCard>
          </div>
          <ChartCard title="PO Status (By Quantity)" icon={PieIcon} loading={loading} empty={totalQty === 0} height={270} raw>
            <DonutChart data={donut} centre={{ caption: 'Total', total: formatQty(totalQty), unit: 'Nos' }} legendValue={(d) => `${formatQty(d.value)} Nos`} tooltip={(d) => `${formatQty(d.value)} Nos`} />
          </ChartCard>
        </div>

        <ReportTable
          title="Customer Order Status Details"
          columns={columns}
          rows={lines}
          loading={loading}
          error={null}
          rowKey="order_line_id"
          searchKeys={['customer_name', 'po_number', 'part_name', 'drawing', 'prd_list', 'status']}
          searchPlaceholder="Search by Customer / PO Reference / Part Name / Drawing No..."
          exportTitle={`Customer Order Status – PO date ${displayDate(r.applied.from)} to ${displayDate(r.applied.to)}`}
          exportName="customer_order_status"
        />
      </div>
    </div>
  )
}
