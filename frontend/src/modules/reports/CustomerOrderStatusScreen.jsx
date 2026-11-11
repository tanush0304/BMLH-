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
import { listOrdersByPoDate, listFgTransactionsUpTo, getPoDateBounds } from '../../data/queries/reports'
import { listProductionOrders, listCustomerOrders } from '../../data/queries/customerOrders'
import { listPoHeaders } from '../../data/queries/customerPoHeaders'
import { openPoSupported, listLineStatuses } from '../../data/queries/openPo'
import { reportLineIncluded, poStatusCounts } from '../../utils/openPo'
import { listCustomers } from '../../data/queries/customers'
import { listProducts } from '../../data/queries/products'
import { displayDate } from '../../utils/reportPeriods'
import { formatLocalISODate } from '../../utils/dates'
import { orderLines, poSummary, monthsBetween, monthlyPoVsDispatch, emptyPoMessage, filterOrderLines } from '../../utils/reportOrders'
import { ORDER_TYPES } from '../../utils/orderType'
import { useDeliveryAddresses } from '../../utils/useDeliveryAddresses'
import { deliveryText, deliveryOptionLabel } from '../../utils/deliveryAddress'
import Banner from '../../components/Banner'

const STATUS_TONES = { Closed: 'green', Open: 'red', Cancelled: 'slate' }

/**
 * Customer Order Status Dashboard: order lines with PO date in the period,
 * dispatched qty from FG Dispatch (up to To) and Closed/Open per line
 * (Closed = dispatched >= order qty); a PO is Closed only when all its lines
 * are. Monthly PO qty vs dispatched, open/closed donut by qty. View opens
 * Order Traceability for the PRD. Filter: Customer.
 */
export default function CustomerOrderStatusScreen({ onOpenTraceability }) {
  const chartType = useChartType()
  const r = useReportPeriod({ customerId: '', orderType: '', deliveryAddressId: '' }, { defaultPeriod: 'thisFY' })
  const [orders, setOrders] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [prdRows, setPrdRows] = useState([])
  // 043: line status from the view; PO counts by the header's po_status
  const [openPo, setOpenPo] = useState(false)
  const [headers, setHeaders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const delivery = useDeliveryAddresses() // 042; Deliver To hidden before it

  useEffect(() => {
    Promise.all([listCustomers(), listProducts()])
      .then(([c, p]) => { setCustomers(c); setProducts(p) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    // 043: lines dated in the period + every line still Open dated up to To
    // (an annual PO never drops out while open); before 043: PO date only.
    const loadLines = async () => {
      if (!(await openPoSupported())) return { lines: await listOrdersByPoDate(r.applied), heads: [], supported: false }
      const [all, statuses, heads] = await Promise.all([listCustomerOrders(), listLineStatuses(), listPoHeaders()])
      const st = new Map(statuses.map((x) => [x.order_line_id, x.line_status]))
      const lines = all
        .map((l) => ({ ...l, line_status: st.get(l.order_line_id) ?? 'Open' }))
        .filter((l) => reportLineIncluded(l, r.applied))
      return { lines, heads, supported: true }
    }
    Promise.all([loadLines(), listFgTransactionsUpTo(r.applied.to), listProductionOrders()])
      .then(([{ lines: o, heads, supported }, fg, prds]) => {
        if (cancelled) return
        setOpenPo(supported)
        setHeaders(heads)
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
    const filtered = filterOrderLines(scoped, {
      orderType: r.applied.orderType,
      deliveryAddressId: delivery.supported ? r.applied.deliveryAddressId : '',
    })
    return orderLines(filtered, dispatched, prdsByLine).map((l) => {
      const p = productBySerial.get(l.part_serial_number)
      return {
        ...l,
        customer_name: customerName.get(l.customer_id) ?? l.customer_id,
        part_name: p?.part_name ?? '',
        drawing: p?.part_drawing_reference_number ?? '',
        deliver_to: deliveryText(l, delivery.byId),
        ...(l.line_status ? { status: l.line_status } : {}),
      }
    })
  }, [orders, dispatches, prdRows, r.applied.customerId, r.applied.orderType, r.applied.deliveryAddressId, customerName, productBySerial, delivery.supported, delivery.byId])

  // Empty period: say where the POs are (latest) and offer "Show all POs"
  // (From = earliest PO date, To = today). Bounds are read only when the state shows.
  const isEmpty = !loading && !error && lines.length === 0
  const [poBounds, setPoBounds] = useState(null)
  useEffect(() => {
    if (!isEmpty) return undefined
    let cancelled = false
    setPoBounds(null)
    getPoDateBounds({ customerId: r.applied.customerId })
      .then((b) => !cancelled && setPoBounds(b))
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [isEmpty, r.applied.customerId])

  // 043: Cancelled lines are listed but left out of qty totals / open counts;
  // Open / Closed POs follow the header's own po_status.
  const liveLines = useMemo(() => lines.filter((l) => l.status !== 'Cancelled'), [lines])
  const po = useMemo(() => (openPo ? poStatusCounts(headers, lines) : poSummary(lines)), [openPo, headers, lines])
  const totalQty = liveLines.reduce((a, l) => a + l.order_qty, 0)
  const totalDispatched = liveLines.reduce((a, l) => a + l.dispatched, 0)
  const monthly = useMemo(() => monthlyPoVsDispatch(liveLines, dispatches, monthsBetween(r.applied.from, r.applied.to)), [liveLines, dispatches, r.applied])

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
    { key: 'order_type', label: 'Order Type' },
    ...(delivery.supported ? [{ key: 'deliver_to', label: 'Deliver To', render: (row) => <span className="block max-w-[180px] truncate" title={row.deliver_to}>{row.deliver_to}</span> }] : []),
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
          filters={[
            { key: 'customer', label: 'Customer', value: r.filters.customerId, onChange: r.setFilter('customerId'), options: customers.map((c) => ({ value: c.customer_id, label: c.customer_name ?? c.customer_id })) },
            { key: 'orderType', label: 'Order Type', value: r.filters.orderType, onChange: r.setFilter('orderType'), options: ORDER_TYPES.map((t) => ({ value: t, label: t })) },
            ...(delivery.supported
              ? [{
                  key: 'deliverTo',
                  label: 'Deliver To',
                  value: r.filters.deliveryAddressId,
                  onChange: r.setFilter('deliveryAddressId'),
                  options: delivery.addresses
                    .filter((a) => !r.filters.customerId || a.customer_id === r.filters.customerId)
                    .map((a) => ({ value: String(a.id), label: `${customerName.get(a.customer_id) ?? a.customer_id} – ${deliveryOptionLabel(a)}` })),
                }]
              : []),
          ]}
        />
        {error && <Banner tone="error" message={error} />}

        <KpiCardRow columns={5}>
          <KpiCard
            label="Total POs"
            value={formatQty(po.total)}
            sub={openPo ? `Lines: ${po.openLines} open · ${po.closedLines} closed · ${po.cancelledLines} cancelled` : undefined}
            icon={FileText}
            tone="blue"
            loading={loading}
          />
          <KpiCard label="Total PO Quantity" value={formatQty(totalQty)} unit="Nos" icon={Package} tone="green" loading={loading} />
          <KpiCard label="Total Quantity Despatched" value={formatQty(totalDispatched)} unit="Nos" icon={Truck} tone="orange" loading={loading} />
          <KpiCard label="Open POs" value={formatQty(po.open)} sub={`PO Qty: ${formatQty(po.openQty)} Nos`} icon={BarChart3} tone="purple" loading={loading} />
          <KpiCard label="Closed POs" value={formatQty(po.closed)} sub={`PO Qty: ${formatQty(po.closedQty)} Nos`} icon={CircleCheck} tone="red" loading={loading} />
        </KpiCardRow>

        {isEmpty && poBounds && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded border border-[#CFE2F8] bg-white px-4 py-2 text-sm text-slate-700">
            <span>{emptyPoMessage(poBounds.latest)}</span>
            {poBounds.earliest && (
              <button
                type="button"
                onClick={() => r.setRangeAndSearch(poBounds.earliest.po_date, formatLocalISODate(new Date()))}
                className="rounded border border-[#1E5FD0] px-3 py-1 text-[13px] font-semibold text-[#1E5FD0] hover:bg-[#E3F0FD]"
              >
                Show all POs
              </button>
            )}
          </div>
        )}

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
