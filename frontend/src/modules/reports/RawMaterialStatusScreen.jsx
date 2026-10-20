import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell } from 'recharts'
import { useChartType, series } from '../../components/reports/ChartTypeToggle'
import { Boxes, Truck, Warehouse, ArrowDownToLine, ArrowUpRight, PackageCheck, BarChart3, Users, PieChart as PieIcon } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ReportFilterBar from '../../components/reports/ReportFilterBar'
import useReportPeriod from '../../components/reports/useReportPeriod'
import { KpiCard, KpiCardRow, formatQty } from '../../components/reports/KpiCard'
import ChartCard, { CHART_COLORS, AXIS_TICK, DonutChart } from '../../components/reports/ChartCard'
import ReportTable from '../../components/reports/ReportTable'
import { listRmTransactionsUpTo, listRmStockMasterRows } from '../../data/queries/reports'
import { listSuppliers } from '../../data/queries/suppliers'
import { displayDate, previousRange } from '../../utils/reportPeriods'
import { changePct } from '../../utils/reportAggregates'
import { stockMovement, topN, sumByUom, dominantUom, rmMatchesFilters } from '../../utils/reportStock'

const SERIES = [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.purple, CHART_COLORS.red, '#64748B']
const partsClass = (v) => (v == null ? '' : v <= 0 ? 'bg-red-100' : 'bg-green-100')

/** "125.6 Kg · 40 Nos" -- quantities are never added across UoMs. */
const perUom = (list) => (list.length === 0 ? '0' : list.map((x) => `${formatQty(x.value)} ${x.uom}`).join(' · '))

/** Movement of one RM; an RM with no transactions still has its opening stock. */
function moveFor(movement, materials, code) {
  const opening = Number(materials.get(code)?.opening_stock) || 0
  return movement.get(code) ?? { opening, receipts: 0, issues: 0, closing: opening }
}

/**
 * Raw Material Status Report: per raw material x BOM part ("raw material
 * stock master"), period opening / receipts / issues / closing from "raw
 * material transactions" (+ the RM's opening_stock), BOM consumption per
 * part and parts the closing stock can make. Totals are per UoM; charts use
 * one UoM (the UoM filter, else the most common one). No ₹ values
 * (cost_per_unit source unconfirmed). Filters: Supplier, RM Type, UoM.
 */
export default function RawMaterialStatusScreen() {
  const chartType = useChartType()
  const r = useReportPeriod({ supplier: '', rmType: '', uom: '', rmCode: '' })
  const [txns, setTxns] = useState([])
  const [master, setMaster] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([listRmStockMasterRows(), listSuppliers()])
      .then(([m, s]) => { setMaster(m); setSuppliers(s) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listRmTransactionsUpTo(r.applied.to)
      .then((data) => !cancelled && setTxns(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [r.applied])

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.supplier_id, s.supplier_name])), [suppliers])

  // One entry per raw material (the view repeats an RM once per BOM part).
  const materials = useMemo(() => {
    const m = new Map()
    for (const row of master) if (!m.has(row.raw_material_code)) m.set(row.raw_material_code, row)
    return m
  }, [master])

  const scopedCodes = useMemo(() => {
    const set = new Set()
    for (const [code, rm] of materials) if (rmMatchesFilters(rm, r.applied)) set.add(code)
    return set
  }, [materials, r.applied])

  const movement = useMemo(
    () => stockMovement(txns, { from: r.applied.from, to: r.applied.to, keyFn: (t) => t.raw_material_code, inType: 'Receipt', outType: 'Issue', openingFor: (code) => materials.get(code)?.opening_stock ?? 0 }),
    [txns, r.applied, materials]
  )

  const rows = useMemo(
    () =>
      master
        .filter((row) => scopedCodes.has(row.raw_material_code))
        .map((row) => {
          const v = moveFor(movement, materials, row.raw_material_code)
          const per = Number(row.consumption_per_unit)
          return {
            row_key: row.row_key,
            raw_material_code: row.raw_material_code,
            material: `${row.raw_material_name ?? ''} (${row.raw_material_code})`,
            rm_type: row.rm_type ?? '',
            part: row.part_serial_number ? `${row.part_name ?? ''} (${row.part_serial_number})` : '—',
            supplier_names: row.supplier_names ?? '',
            unit_of_measurement: row.unit_of_measurement ?? '',
            opening: v.opening,
            receipts: v.receipts,
            issues: v.issues,
            closing: v.closing,
            consumption: per > 0 ? per : null,
            parts: per > 0 ? Math.max(0, Math.floor(v.closing / per)) : null,
          }
        }),
    [master, scopedCodes, movement, materials]
  )

  // Per-RM rows (no BOM duplicates) for totals and stock charts.
  const rmRows = useMemo(
    () => [...scopedCodes].map((code) => ({ code, ...materials.get(code), ...moveFor(movement, materials, code) })),
    [scopedCodes, materials, movement]
  )
  // Suppliers linked to the RMs in scope, plus any that delivered them in the period.
  const supplierCount = useMemo(() => {
    const names = new Set(rmRows.flatMap((x) => (x.supplier_names ? x.supplier_names.split(', ') : [])))
    const codes = new Set(rmRows.map((x) => x.code))
    for (const t of txns) {
      if (t.transaction_type === 'Receipt' && t.supplier_id && t.transaction_date >= r.applied.from && codes.has(t.raw_material_code)) names.add(supplierName.get(t.supplier_id) ?? t.supplier_id)
    }
    return names.size
  }, [rmRows, txns, r.applied.from, supplierName])

  // "vs Previous Period" only when one UoM is selected (a % across units would mix them).
  const prevTotals = useMemo(() => {
    if (!r.applied.uom) return null
    const prev = previousRange(r.applied)
    const m = stockMovement(txns, { ...prev, keyFn: (t) => t.raw_material_code, inType: 'Receipt', outType: 'Issue', openingFor: (code) => materials.get(code)?.opening_stock ?? 0 })
    const t = { opening: 0, receipts: 0, issues: 0, closing: 0 }
    for (const code of scopedCodes) {
      const v = moveFor(m, materials, code)
      t.opening += v.opening; t.receipts += v.receipts; t.issues += v.issues; t.closing += v.closing
    }
    return t
  }, [txns, r.applied, materials, scopedCodes])
  const curTotal = (field) => rmRows.reduce((a, x) => a + (Number(x[field]) || 0), 0)
  const delta = (field) => (prevTotals ? { value: changePct(curTotal(field), prevTotals[field]), caption: 'vs Previous Period' } : undefined)

  const chartUom = r.applied.uom || dominantUom(rmRows)
  const chartRms = rmRows.filter((x) => (x.unit_of_measurement || '—') === chartUom)
  const byType = useMemo(() => {
    const m = new Map()
    for (const x of chartRms) {
      const k = x.rm_type || '—'
      const t = m.get(k) ?? { label: k, opening: 0, receipts: 0, issues: 0, closing: 0 }
      t.opening += x.opening; t.receipts += x.receipts; t.issues += x.issues; t.closing += x.closing
      m.set(k, t)
    }
    return [...m.values()].sort((a, b) => b.closing - a.closing)
  }, [chartRms])

  const bySupplier = useMemo(() => {
    const codes = new Set(chartRms.map((x) => x.code))
    const m = new Map()
    for (const t of txns) {
      if (t.transaction_type !== 'Receipt' || t.transaction_date < r.applied.from || !codes.has(t.raw_material_code)) continue
      const name = supplierName.get(t.supplier_id) ?? 'No supplier'
      if (r.applied.supplier && name !== r.applied.supplier) continue
      m.set(name, (m.get(name) ?? 0) + (Number(t.qty) || 0))
    }
    return topN([...m].map(([label, value]) => ({ label, value })), 5)
  }, [txns, chartRms, r.applied, supplierName])

  const partsByType = useMemo(() => {
    const m = new Map()
    for (const x of rows) if (x.parts) m.set(x.rm_type || '—', (m.get(x.rm_type || '—') ?? 0) + x.parts)
    return topN([...m].map(([label, value]) => ({ label, value })), 4).map((x, i) => ({ key: x.label, label: x.label, value: x.value, color: SERIES[i % SERIES.length] }))
  }, [rows])
  const partsTotal = partsByType.reduce((a, x) => a + x.value, 0)

  const allRms = [...materials.values()]
  const typeOptions = [...new Set(allRms.map((x) => x.rm_type).filter(Boolean))].sort()
  const uomOptions = [...new Set(allRms.map((x) => x.unit_of_measurement).filter(Boolean))].sort()
  // RM Code options from RM Master, narrowed by the other (not yet applied) filters.
  const rmCodeOptions = allRms
    .filter((x) => rmMatchesFilters(x, { ...r.filters, rmCode: '' }))
    .map((x) => ({ value: x.raw_material_code, label: x.raw_material_name ? `${x.raw_material_code} – ${x.raw_material_name}` : x.raw_material_code }))
    .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }))
  const supplierOptions = [...new Set(allRms.flatMap((x) => (x.supplier_names ? x.supplier_names.split(', ') : [])))].sort()

  const columns = [
    { key: 'material', label: 'Raw Material' },
    { key: 'rm_type', label: 'Type of Raw Material' },
    { key: 'part', label: 'Related Finish Product Name' },
    { key: 'supplier_names', label: 'Supplier Name' },
    { key: 'unit_of_measurement', label: 'UOM' },
    { key: 'opening', label: 'Opening Stock Quantity', align: 'right', format: formatQty },
    { key: 'receipts', label: 'Receipt Quantity', align: 'right', format: formatQty },
    { key: 'issues', label: 'Issue Quantity', align: 'right', format: formatQty },
    { key: 'closing', label: 'Closing Stock Quantity', align: 'right', format: formatQty, cellClass: () => 'bg-green-100' },
    { key: 'consumption', label: 'Std Parts Quantity (per part)', align: 'right', format: formatQty },
    { key: 'parts', label: 'Total Parts Material Available', align: 'right', format: formatQty, cellClass: partsClass },
  ]
  const unitLabel = chartUom ? ` (${chartUom})` : ''

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Raw Material Status Report" subtitle="Right Material | Right Quantity | Right Production" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <ReportFilterBar
          {...r.barProps}
          loading={loading}
          filters={[
            { key: 'supplier', label: 'Supplier', value: r.filters.supplier, onChange: r.setFilter('supplier'), options: supplierOptions },
            { key: 'type', label: 'RM Type', value: r.filters.rmType, onChange: r.setFilter('rmType'), options: typeOptions },
            { key: 'uom', label: 'UOM', allLabel: 'UoM', value: r.filters.uom, onChange: r.setFilter('uom'), options: uomOptions },
            { key: 'rmCode', label: 'RM Code', value: r.filters.rmCode, onChange: r.setFilter('rmCode'), options: rmCodeOptions },
          ]}
        />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <KpiCardRow>
          <KpiCard label="Total RM Items" value={formatQty(rmRows.length)} icon={Boxes} tone="blue" loading={loading} />
          <KpiCard label="Total Suppliers" value={formatQty(supplierCount)} icon={Truck} tone="green" loading={loading} />
          <KpiCard label="Opening Stock" value={perUom(sumByUom(rmRows, 'opening'))} delta={delta('opening')} icon={Warehouse} tone="orange" loading={loading} />
          <KpiCard label="Total Receipts" value={perUom(sumByUom(rmRows, 'receipts'))} delta={delta('receipts')} icon={ArrowDownToLine} tone="purple" loading={loading} />
          <KpiCard label="Total Issues" value={perUom(sumByUom(rmRows, 'issues'))} delta={delta('issues')} icon={ArrowUpRight} tone="red" loading={loading} />
          <KpiCard label="Closing Stock" value={perUom(sumByUom(rmRows, 'closing'))} delta={delta('closing')} icon={PackageCheck} tone="teal" loading={loading} />
        </KpiCardRow>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <ChartCard title={`Stock Position by RM Type${unitLabel}`} icon={BarChart3} loading={loading} empty={byType.length === 0} height={260}>
            <ComposedChart data={byType} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} interval={0} />
              <YAxis tick={AXIS_TICK} width={48} />
              <Tooltip formatter={(v) => `${formatQty(v)} ${chartUom ?? ''}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series(chartType, { key: 'opening', dataKey: 'opening', name: 'Opening Stock', color: CHART_COLORS.blue })}
              {series(chartType, { key: 'receipts', dataKey: 'receipts', name: 'Receipts', color: CHART_COLORS.green })}
              {series(chartType, { key: 'issues', dataKey: 'issues', name: 'Issues', color: CHART_COLORS.orange })}
              {series(chartType, { key: 'closing', dataKey: 'closing', name: 'Closing Stock', color: CHART_COLORS.purple })}
            </ComposedChart>
          </ChartCard>

          <ChartCard title={`Receipts by Supplier (Top 5)${unitLabel}`} icon={Users} loading={loading} empty={bySupplier.length === 0} height={260}>
            <ComposedChart data={bySupplier} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} />
              <YAxis type="category" dataKey="label" tick={AXIS_TICK} width={110} />
              <Tooltip formatter={(v) => `${formatQty(v)} ${chartUom ?? ''}`} />
              {series(chartType, {
                key: 'value',
                dataKey: 'value',
                name: 'Receipts',
                children: [
                  ...bySupplier.map((x, i) => <Cell key={x.label} fill={SERIES[i % SERIES.length]} />),
                  <LabelList key="label" dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700 }} formatter={formatQty} />,
                ],
              })}
            </ComposedChart>
          </ChartCard>

          <ChartCard title="RM Type wise Material Availability (Parts)" icon={PieIcon} loading={loading} empty={partsByType.length === 0} height={260} raw>
            <DonutChart data={partsByType} centre={{ caption: 'Total Parts Available', total: formatQty(partsTotal), unit: 'Nos' }} tooltip={(d) => `${formatQty(d.value)} parts`} />
          </ChartCard>
        </div>

        <ReportTable
          title="Raw Material Status Details"
          columns={columns}
          rows={rows}
          loading={loading}
          error={null}
          rowKey="row_key"
          searchKeys={['material', 'rm_type', 'part', 'supplier_names']}
          searchPlaceholder="Search by RM Type / Supplier / Product..."
          exportTitle={`Raw Material Status Report – ${displayDate(r.applied.from)} to ${displayDate(r.applied.to)}`}
          exportName="raw_material_status_report"
        />
      </div>
    </div>
  )
}
