import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { Boxes, Warehouse, ArrowDownToLine, Truck, PackageCheck, FileText, BarChart3, Users, PieChart as PieIcon } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK, DonutChart } from '../../components/reports/ChartCard'
import ReportTable from '../../components/reports/ReportTable'
import { listFgTransactionsUpTo, listFgMasterRows, listPartDrawingRefs } from '../../data/queries/reports'
import { daysBetween, previousRange, shortDate, displayDate } from '../../utils/reportPeriods'
import { changePct, trendBuckets } from '../../utils/reportAggregates'
import { monthLabel } from '../../utils/reportOrders'
import { stockMovement, dailyMovement, topN, orderFulfilment } from '../../utils/reportStock'

const IN = 'Production Receipt'
const OUT = 'Dispatch'
const TOP_COLORS = [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.purple, CHART_COLORS.red, '#64748B']
const balanceClass = (v) => (v == null ? '' : v <= 0 ? 'bg-green-100' : 'bg-amber-100')

/** Movement totals over the given PRDs for one window. */
function windowTotals(txns, range, prds) {
  const m = stockMovement(txns, { ...range, keyFn: (t) => t.prd_no, inType: IN, outType: OUT })
  let opening = 0, receipts = 0, issues = 0, closing = 0
  for (const [prd, v] of m) {
    if (!prds.has(prd)) continue
    opening += v.opening; receipts += v.receipts; issues += v.issues; closing += v.closing
  }
  return { opening, receipts, issues, closing }
}

/**
 * Finished Goods Inventory Report from "finished goods transactions"
 * (Production Receipt in, Dispatch out) per PRD, with part / customer from
 * "finished goods master". FG has no opening stock in the master, so the
 * period's opening = receipts - dispatches before From. Balance to Dispatch
 * = order qty - dispatched up to To. Filters: Customer, PRD No. (FG Type dropped --
 * no such field since 014; its donut slot shows Order Fulfilment by PO line.)
 */
export default function FgInventoryScreen() {
  const chartType = useChartType()
  const r = useReportPeriod({ customer: '', prdNo: '' })
  const [txns, setTxns] = useState([])
  const [master, setMaster] = useState([])
  const [drawings, setDrawings] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([listFgMasterRows(), listPartDrawingRefs()])
      .then(([m, d]) => { setMaster(m); setDrawings(new Map(d.map((x) => [x.part_serial_number, x.part_drawing_reference_number]))) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    // Everything up to To: also covers the previous period (for the deltas).
    listFgTransactionsUpTo(r.applied.to)
      .then((data) => !cancelled && setTxns(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [r.applied])

  const masterByPrd = useMemo(() => new Map(master.map((m) => [m.prd_no, m])), [master])
  const prdsInScope = useMemo(
    () =>
      new Set(
        master
          .filter((m) => (!r.applied.customer || m.customer_name === r.applied.customer) && (!r.applied.prdNo || m.prd_no === r.applied.prdNo))
          .map((m) => m.prd_no)
      ),
    [master, r.applied.customer, r.applied.prdNo]
  )

  const rows = useMemo(() => {
    const m = stockMovement(txns, { from: r.applied.from, to: r.applied.to, keyFn: (t) => t.prd_no, inType: IN, outType: OUT })
    const dispatchedToDate = new Map()
    for (const t of txns) if (t.transaction_type === OUT) dispatchedToDate.set(t.prd_no, (dispatchedToDate.get(t.prd_no) ?? 0) + (Number(t.qty) || 0))
    const out = []
    for (const [prd, v] of m) {
      if (!prdsInScope.has(prd)) continue
      if (v.opening === 0 && v.receipts === 0 && v.issues === 0) continue
      const fg = masterByPrd.get(prd) ?? {}
      // 030: per PRD -- its own (batch) qty and balance; the PO line's qty is
      // in "finished goods master".order_quantity.
      const orderQty = fg.prd_qty == null ? (fg.order_quantity == null ? null : Number(fg.order_quantity)) : Number(fg.prd_qty)
      out.push({
        prd_no: prd,
        customer_name: fg.customer_name ?? '',
        order_qty: orderQty,
        part_serial_number: fg.part_serial_number ?? '',
        part_name: fg.part_name ?? '',
        drawing: drawings.get(fg.part_serial_number) ?? '',
        uom: fg.unit_of_measurement ?? '',
        opening: v.opening,
        receipts: v.receipts,
        dispatched: v.issues,
        closing: v.closing,
        balance: orderQty == null ? null : orderQty - (dispatchedToDate.get(prd) ?? 0),
      })
    }
    return out.sort((a, b) => a.prd_no.localeCompare(b.prd_no, undefined, { numeric: true }))
  }, [txns, r.applied, prdsInScope, masterByPrd, drawings])

  const cur = useMemo(() => windowTotals(txns, r.applied, prdsInScope), [txns, r.applied, prdsInScope])
  const prev = useMemo(() => windowTotals(txns, previousRange(r.applied), prdsInScope), [txns, r.applied, prdsInScope])
  const balanceTotal = rows.reduce((a, x) => a + (x.balance ?? 0), 0)

  const scopedTxns = useMemo(() => txns.filter((t) => prdsInScope.has(t.prd_no)), [txns, prdsInScope])
  const trend = useMemo(
    () =>
      trendBuckets(dailyMovement(scopedTxns, { days: daysBetween(r.applied.from, r.applied.to), inType: IN, outType: OUT }), {
        sum: ['receipts', 'issues'],
        last: ['balance'],
        dayLabel: shortDate,
        monthLabel,
      }),
    [scopedTxns, r.applied]
  )
  const byCustomer = useMemo(() => {
    const m = new Map()
    for (const x of rows) m.set(x.customer_name || '—', (m.get(x.customer_name || '—') ?? 0) + x.closing)
    return topN([...m].map(([label, value]) => ({ label, value })), 5)
  }, [rows])

  // Order Fulfilment donut: the PO lines of the PRDs in the table, as of To.
  const fulfilment = useMemo(() => {
    const lineIds = new Set(rows.map((x) => masterByPrd.get(x.prd_no)?.order_line_id).filter((id) => id != null))
    return orderFulfilment(master, txns, lineIds, { inType: IN, outType: OUT })
  }, [rows, master, txns, masterByPrd])
  const fulfilmentDonut = [
    { key: 'dispatched', label: 'Despatched', value: fulfilment.dispatched, color: CHART_COLORS.green },
    { key: 'stock', label: 'In FG stock', value: fulfilment.inStock, color: CHART_COLORS.blue },
    { key: 'pending', label: 'Yet to produce', value: fulfilment.yetToProduce, color: CHART_COLORS.orange },
  ]

  const customerOptions = useMemo(() => [...new Set(master.map((m) => m.customer_name).filter(Boolean))].sort(), [master])
  // PRD list narrows to the chosen Customer (not yet applied too).
  const prdOptions = useMemo(
    () =>
      [...new Set(master.filter((m) => !r.filters.customer || m.customer_name === r.filters.customer).map((m) => m.prd_no).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
    [master, r.filters.customer]
  )
  const delta = (c, p) => ({ value: changePct(c, p), caption: 'vs Previous Period' })

  const columns = [
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'prd_no', label: 'PRD No' },
    { key: 'order_qty', label: 'PRD Quantity (Nos)', align: 'right', format: formatQty },
    { key: 'part_serial_number', label: 'Part Sl No' },
    { key: 'part_name', label: 'Part Name' },
    { key: 'drawing', label: 'Part Drawing Ref No' },
    { key: 'uom', label: 'UOM' },
    { key: 'opening', label: 'Opening FG Stock Quantity', align: 'right', format: formatQty },
    { key: 'receipts', label: 'Receipt Quantity for Despatch', align: 'right', format: formatQty },
    { key: 'dispatched', label: 'Quantity Despatched', align: 'right', format: formatQty },
    { key: 'closing', label: 'Closing FG Stock Quantity', align: 'right', format: formatQty, cellClass: () => 'bg-green-100' },
    { key: 'balance', label: 'Balance to Despatch', align: 'right', format: formatQty, cellClass: balanceClass },
  ]
  const totalsRow = { order_qty: rows.reduce((a, x) => a + (x.order_qty ?? 0), 0), opening: cur.opening, receipts: cur.receipts, dispatched: cur.issues, closing: cur.closing, balance: balanceTotal }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Finished Goods Inventory Report" subtitle="Right Material | Right Quantity | Right Production" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={[
            { key: 'customer', label: 'Customer', value: r.filters.customer, onChange: r.setFilter('customer'), options: customerOptions },
            { key: 'prd', label: 'PRD No', value: r.filters.prdNo, onChange: r.setFilter('prdNo'), options: prdOptions },
          ]}
        />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow>
          <KpiCard label="Total FG Items" value={formatQty(rows.length)} unit="Nos" icon={Boxes} tone="purple" loading={loading} />
          <KpiCard label="Opening FG Stock" value={formatQty(cur.opening)} unit="Nos" icon={Warehouse} tone="blue" loading={loading} />
          <KpiCard label="Total Receipts" value={formatQty(cur.receipts)} unit="Nos" delta={delta(cur.receipts, prev.receipts)} icon={ArrowDownToLine} tone="green" loading={loading} />
          <KpiCard label="Total Despatched" value={formatQty(cur.issues)} unit="Nos" delta={delta(cur.issues, prev.issues)} icon={Truck} tone="orange" loading={loading} />
          <KpiCard label="Closing FG Stock" value={formatQty(cur.closing)} unit="Nos" delta={delta(cur.closing, prev.closing)} icon={PackageCheck} tone="red" loading={loading} />
          <KpiCard label="Balance to Despatch" value={formatQty(balanceTotal)} unit="Nos" icon={FileText} tone="teal" loading={loading} />
        </KpiCardRow>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <div>
            <ChartCard title="FG Stock Movement Trend" icon={BarChart3} loading={loading} empty={rows.length === 0} height={260}>
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} minTickGap={12} />
                <YAxis tick={AXIS_TICK} width={44} allowDecimals={false} />
                <Tooltip formatter={(v) => `${formatQty(v)} Nos`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series(chartType, { key: 'receipts', dataKey: 'receipts', name: 'Receipts', color: CHART_COLORS.green })}
                {series(chartType, { key: 'issues', dataKey: 'issues', name: 'Despatched', color: CHART_COLORS.orange })}
                <Line dataKey="balance" name="Closing Stock" stroke={CHART_COLORS.purple} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ChartCard>
          </div>
          <div>
            <ChartCard title="FG Stock by Customer (Top 5)" icon={Users} loading={loading} empty={byCustomer.length === 0} height={260}>
              <ComposedChart data={byCustomer} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={AXIS_TICK} width={110} />
                <Tooltip formatter={(v) => `${formatQty(v)} Nos`} />
                {series(chartType, {
                  key: 'value',
                  dataKey: 'value',
                  name: 'FG Stock (Nos)',
                  children: [
                    ...byCustomer.map((x, i) => <Cell key={x.label} fill={TOP_COLORS[i % TOP_COLORS.length]} />),
                    <LabelList key="label" dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700 }} formatter={formatQty} />,
                  ],
                })}
              </ComposedChart>
            </ChartCard>
          </div>
          <div>
            <ChartCard title="Order Fulfilment (by qty)" icon={PieIcon} loading={loading} empty={fulfilment.total === 0} height={260} raw>
              <DonutChart
                data={fulfilmentDonut}
                centre={{ caption: 'Total', total: formatQty(fulfilment.total), unit: 'Nos' }}
                legendValue={(d) => `${formatQty(d.value)} Nos`}
                tooltip={(d) => `${formatQty(d.value)} Nos`}
              />
            </ChartCard>
          </div>
        </div>

        <ReportTable
          title="Finished Goods Inventory Details"
          columns={columns}
          rows={rows}
          totalsRow={totalsRow}
          loading={loading}
          error={null}
          rowKey="prd_no"
          searchKeys={['customer_name', 'prd_no', 'part_name', 'part_serial_number', 'drawing']}
          searchPlaceholder="Search by Customer / PRD No / Part Name..."
          exportTitle={`Finished Goods Inventory Report – ${displayDate(r.applied.from)} to ${displayDate(r.applied.to)}`}
          exportName="fg_inventory_report"
        />
      </div>
    </div>
  )
}
