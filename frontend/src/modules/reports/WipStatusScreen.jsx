import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { Boxes, Settings, Package, ArrowRight, CircleCheck, BarChart3, PieChart as PieIcon, TrendingUp } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK, DonutChart } from '../../components/reports/ChartCard'
import ReportTable from '../../components/reports/ReportTable'
import { listWipTransactionsUpTo } from '../../data/queries/reports'
import { listOrdersByPrd } from '../../data/queries/customerOrders'
import { listAllStages } from '../../data/queries/routeCards'
import { stageLabel } from '../../utils/stageLabel'
import { addDays, daysBetween, shortDate, displayDate } from '../../utils/reportPeriods'
import { stockMovement, dailyBalance, topN } from '../../utils/reportStock'

const SERIES = [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.purple, CHART_COLORS.red, '#0F9F8F', CHART_COLORS.amber]
const TREND_DAYS = 10
const balanceClass = (v) => (v > 0 ? 'bg-amber-100' : 'bg-green-100')

/**
 * WIP Status Report from "wip transactions": per PRD + stage, received into
 * stores and issued to machines in the period, latest dates, and the WIP
 * balance as of To (receipts - issues since the start; WIP has no opening
 * stock). Filters: PRD, Type of Operation.
 */
export default function WipStatusScreen() {
  const chartType = useChartType()
  const r = useReportPeriod({ prdNo: '', operation: '' })
  const [txns, setTxns] = useState([])
  const [orders, setOrders] = useState([])
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([listOrdersByPrd(), listAllStages()])
      .then(([o, s]) => { setOrders(o); setStages(s) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listWipTransactionsUpTo(r.applied.to)
      .then((data) => !cancelled && setTxns(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [r.applied])

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])
  const orderByPrd = useMemo(() => new Map(orders.map((o) => [o.prd_no, o])), [orders])

  // Filtered ledger: PRD and operation (the source stage's operation).
  const filtered = useMemo(() => {
    const { prdNo, operation } = r.applied
    return txns.filter((t) => (!prdNo || t.prd_no === prdNo) && (!operation || stageById.get(t.nature_of_operation_stage_id)?.operation === operation))
  }, [txns, r.applied, stageById])

  const rows = useMemo(() => {
    const m = stockMovement(filtered, { from: r.applied.from, to: r.applied.to, keyFn: (t) => `${t.prd_no}|${t.nature_of_operation_stage_id}`, inType: 'Receipt', outType: 'Issue' })
    const out = []
    for (const [key, v] of m) {
      if (v.receipts === 0 && v.issues === 0 && v.closing === 0) continue
      const [prdNo, stageId] = key.split('|')
      const stage = stageById.get(Number(stageId))
      out.push({
        key,
        prd_no: prdNo,
        order_qty: orderByPrd.get(prdNo)?.prd_qty ?? null, // the PRD's own (batch) qty
        operation: stage?.operation ?? '',
        stage_label: stage ? stageLabel(stage) : '',
        stage_seq: stage?.seq ?? 0,
        received: v.receipts,
        last_receipt: v.lastReceipt,
        issued: v.issues,
        last_issue: v.lastIssue,
        balance: v.closing,
      })
    }
    return out.sort((a, b) => a.prd_no.localeCompare(b.prd_no, undefined, { numeric: true }) || a.stage_seq - b.stage_seq)
  }, [filtered, r.applied, stageById, orderByPrd])

  const kpi = useMemo(() => {
    const prds = [...new Set(rows.map((x) => x.prd_no))]
    return {
      prds: prds.length,
      orderQty: prds.reduce((a, p) => a + (Number(orderByPrd.get(p)?.prd_qty) || 0), 0),
      received: rows.reduce((a, x) => a + x.received, 0),
      issued: rows.reduce((a, x) => a + x.issued, 0),
      balance: rows.reduce((a, x) => a + x.balance, 0),
    }
  }, [rows, orderByPrd])

  const byOperation = useMemo(() => {
    const m = new Map()
    for (const x of rows) m.set(x.operation || '—', (m.get(x.operation || '—') ?? 0) + x.balance)
    return [...m].map(([label, value]) => ({ label, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
  }, [rows])
  const donut = topN(byOperation, 4).map((x, i) => ({ key: x.label, label: x.label, value: x.value, color: SERIES[i % SERIES.length] }))

  const trendDays = useMemo(() => {
    const start = addDays(r.applied.to, -(TREND_DAYS - 1))
    return daysBetween(start < r.applied.from ? r.applied.from : start, r.applied.to)
  }, [r.applied])
  const trend = useMemo(() => dailyBalance(filtered, { days: trendDays, inType: 'Receipt', outType: 'Issue' }).map((d) => ({ ...d, label: shortDate(d.date) })), [filtered, trendDays])

  const operationOptions = useMemo(() => [...new Set(stages.map((s) => s.operation).filter(Boolean))].sort(), [stages])
  const prdOptions = useMemo(() => [...new Set(txns.map((t) => t.prd_no))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [txns])

  const columns = [
    { key: 'prd_no', label: 'PRD No' },
    { key: 'order_qty', label: 'PRD Order Quantity (Nos)', align: 'right', format: formatQty },
    { key: 'stage_label', label: 'Type of Operation Completed' },
    { key: 'received', label: 'Quantity Received to Stores (Nos)', align: 'right', format: formatQty },
    { key: 'last_receipt', label: 'Date of Receipt', format: (v) => (v ? displayDate(v) : '—') },
    { key: 'issued', label: 'Issue Quantity to Machine (Nos)', align: 'right', format: formatQty },
    { key: 'last_issue', label: 'Date of Issue', format: (v) => (v ? displayDate(v) : '—') },
    { key: 'balance', label: 'Balance WIP Quantity in Stores (Nos)', align: 'right', format: formatQty, cellClass: balanceClass },
  ]
  const totalsRow = { order_qty: kpi.orderQty, received: kpi.received, issued: kpi.issued, balance: kpi.balance }
  const empty = rows.length === 0

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="WIP Status Report" subtitle="Right Material | Right Quantity | Right Production" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={[
            { key: 'prd', label: 'PRD No', value: r.filters.prdNo, onChange: r.setFilter('prdNo'), options: prdOptions },
            { key: 'op', label: 'Type of Operation', allLabel: 'Operation', value: r.filters.operation, onChange: r.setFilter('operation'), options: operationOptions },
          ]}
        />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow columns={5}>
          <KpiCard label="Total PRD Orders" value={formatQty(kpi.prds)} icon={Boxes} tone="blue" loading={loading} />
          <KpiCard label="Total Order Quantity" value={formatQty(kpi.orderQty)} unit="Nos" icon={Settings} tone="green" loading={loading} />
          <KpiCard label="Quantity Received in Stores (WIP)" value={formatQty(kpi.received)} unit="Nos" icon={Package} tone="orange" loading={loading} />
          <KpiCard label="Issued to Machines" value={formatQty(kpi.issued)} unit="Nos" icon={ArrowRight} tone="purple" loading={loading} />
          <KpiCard label="Balance WIP in Stores" value={formatQty(kpi.balance)} unit="Nos" icon={CircleCheck} tone="red" loading={loading} />
        </KpiCardRow>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <ChartCard title="WIP Quantity by Operation" icon={BarChart3} loading={loading} empty={byOperation.length === 0}>
            <ComposedChart data={byOperation} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} interval={0} />
              <YAxis tick={AXIS_TICK} width={44} allowDecimals={false} />
              <Tooltip formatter={(v) => `${formatQty(v)} Nos`} />
              {series(chartType, {
                key: 'value',
                dataKey: 'value',
                name: 'Balance WIP (Nos)',
                children: [
                  ...byOperation.map((x, i) => <Cell key={x.label} fill={SERIES[i % SERIES.length]} />),
                  <LabelList key="label" dataKey="value" position="top" style={{ fontSize: 11, fontWeight: 700 }} formatter={formatQty} />,
                ],
              })}
            </ComposedChart>
          </ChartCard>

          <ChartCard title="WIP Status" icon={PieIcon} loading={loading} empty={donut.length === 0} raw>
            <DonutChart data={donut} centre={{ caption: 'Total WIP', total: formatQty(kpi.balance), unit: 'Nos' }} tooltip={(d) => `${formatQty(d.value)} Nos`} />
          </ChartCard>

          <ChartCard title={`WIP Status (Last ${trendDays.length} Days)`} icon={TrendingUp} loading={loading} empty={empty}>
            <ComposedChart data={trend} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} width={44} allowDecimals={false} />
              <Tooltip formatter={(v) => `${formatQty(v)} Nos`} />
              {series(chartType, {
                key: 'balance',
                dataKey: 'balance',
                name: 'WIP Quantity (Nos)',
                color: CHART_COLORS.blue,
                children: <LabelList dataKey="balance" position="top" style={{ fontSize: 11, fontWeight: 700 }} formatter={formatQty} />,
              })}
            </ComposedChart>
          </ChartCard>
        </div>

        <ReportTable
          title="WIP Status Details"
          columns={columns}
          rows={rows}
          totalsRow={totalsRow}
          loading={loading}
          error={null}
          rowKey="key"
          searchKeys={['prd_no', 'operation', 'stage_label']}
          searchPlaceholder="Search by PRD No / Operation..."
          exportTitle={`WIP Status Report – ${displayDate(r.applied.from)} to ${displayDate(r.applied.to)}`}
          exportName="wip_status_report"
        />
      </div>
    </div>
  )
}
