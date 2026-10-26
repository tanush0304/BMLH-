import { useEffect, useState } from 'react'
import { ClipboardList, Eye, Route, Layers, Plus, Trash2, Ban } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import FormSection, { Field, TextInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import RecordsList from '../../components/RecordsList'
import StageTraceTable from '../../components/StageTraceTable'
import JobRouteCardSheet from '../../components/JobRouteCardSheet'
import { listOrdersAvailableForPlanning, listProductionPlans } from '../../data/queries/productionPlanning'
import { listProductionBatches } from '../../data/queries/productionBatch'
import { listCustomers } from '../../data/queries/customers'
import { listPoHeaders } from '../../data/queries/customerPoHeaders'
import { listProducts } from '../../data/queries/products'
import { planProductionOrders, cancelProductionOrder } from '../../data/queries/routeCards'
import { listRawMaterialStockBalance } from '../../data/queries/rawMaterialStock'
import { listRawMaterials } from '../../data/queries/rawMaterials'
import { listAllProductRawMaterials } from '../../data/queries/productRawMaterials'
import { suggestSplit, validateSplit, masterBatchSizeFor } from '../../utils/batchSplit'
import { dbErrorMessage } from '../../utils/dbErrors'
import Banner from '../../components/Banner'

const LIST_COLUMNS = [
  { key: 'jc_no', label: 'JC No' },
  { key: 'customer_order_no', label: 'PRD No' },
  { key: 'po_number', label: 'PO No' },
  { key: 'batch_label', label: 'Batch' },
  { key: 'line_progress', label: 'PO Line Progress' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'part_drawing_reference_number', label: 'Part Drawing Number' },
  { key: 'order_qty', label: 'PO Line Qty' },
  { key: 'expected_delivery', label: 'Expected Delivery' },
  { key: 'available_rm_qty_snapshot', label: 'Available RM Qty', render: (r) => r.available_rm_qty_snapshot ?? 'Pending BOM' },
  { key: 'units_producible', label: 'Total Units Can Be Produced', render: (r) => r.units_producible ?? 'Pending BOM' },
  { key: 'prd_qty', label: 'PRD (Batch) Qty' },
  { key: 'status', label: 'Status', type: 'status' },
]

const EMPTY_FORM = { po_key: '', line_id: '', shift_hours: '' }

// Dropdown 1 value for older flat orders saved before PO headers existed
// (customer orders.parent_po_id is null).
const NO_PO_KEY = 'no-po'

export const CANCEL_BLOCKED = "Production has started -- can't cancel"

/**
 * Production Planning (migration 030): pick a PO line, split what is left to
 * plan into batches (suggested from Production Batch Master: max per PRD,
 * last = remainder; editable; a batch above the master size is blocked --
 * row error, Save disabled, and plan_production_orders refuses it, 038),
 * tick the batches to plan now, Save -> one PRD + Job Route Card per ticked
 * batch (plan_production_orders). The rest stays on the line for later.
 * Supervisor/admin can Cancel a PRD that has not started (reason required).
 */
export default function ProductionPlanningScreen() {
  const [lines, setLines] = useState([])
  const [poHeaders, setPoHeaders] = useState([])
  const [plans, setPlans] = useState([])
  const [batchMaster, setBatchMaster] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [bom, setBom] = useState([])
  const [stockBalance, setStockBalance] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [split, setSplit] = useState([]) // [{ qty, plan }]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [viewedPrd, setViewedPrd] = useState(null)
  const [routeCardPrd, setRouteCardPrd] = useState(null)

  async function refresh() {
    const [lineRows, poHeaderRows, planRows, batchRows, customerRows, productRows, bomRows, balanceRows, rmRows] = await Promise.all([
      listOrdersAvailableForPlanning(),
      listPoHeaders(),
      listProductionPlans(),
      listProductionBatches(),
      listCustomers(),
      listProducts(),
      listAllProductRawMaterials(),
      listRawMaterialStockBalance(),
      listRawMaterials(),
    ])
    setLines(lineRows)
    setPoHeaders(poHeaderRows)
    setPlans(planRows)
    setBatchMaster(batchRows)
    setCustomers(customerRows)
    setProducts(productRows)
    setBom(bomRows)
    setStockBalance(balanceRows)
    setRawMaterials(rmRows)
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [])

  const selectedLine = lines.find((l) => String(l.order_line_id) === String(form.line_id))
  const selectedCustomer = customers.find((c) => c.customer_id === selectedLine?.customer_id)
  const selectedProduct = products.find((p) => p.part_serial_number === selectedLine?.part_serial_number)
  const masterBatchSize = masterBatchSizeFor(batchMaster, selectedLine?.part_serial_number)
  const check = selectedLine ? validateSplit(split, selectedLine.remaining_qty, masterBatchSize, selectedLine.part_serial_number) : null

  // Raw material for the part's BOM: stock and how many units it covers. No
  // BOM row -> "Pending BOM" (no guessing).
  const bomRows = bom.filter((b) => b.part_serial_number === selectedLine?.part_serial_number)
  const materialAvailability = bomRows.map((r) => {
    const stock = stockBalance.find((b) => b.raw_material_code === r.raw_material_code)?.current_stock ?? 0
    return {
      raw_material_code: r.raw_material_code,
      consumption_per_unit: Number(r.consumption_per_unit),
      current_stock: stock,
      units_producible: r.consumption_per_unit > 0 ? Math.floor(stock / r.consumption_per_unit) : null,
    }
  })
  const hasBom = materialAvailability.length > 0
  const unitsProducible = hasBom ? Math.min(...materialAvailability.map((m) => m.units_producible)) : null
  const rmUnit = materialAvailability.length === 1
    ? rawMaterials.find((m) => m.raw_material_code === materialAvailability[0].raw_material_code)?.unit_of_measurement || undefined
    : undefined
  const availableRmQtyDisplay = hasBom
    ? materialAvailability.length === 1
      ? materialAvailability[0].current_stock
      : materialAvailability.map((m) => `${m.raw_material_code}: ${m.current_stock}`).join(', ')
    : 'Pending BOM'

  // Dropdown 1: POs with at least one line still to plan.
  const poOptions = poHeaders
    .filter((h) => lines.some((l) => l.parent_po_id === h.id))
    .map((h) => ({ value: String(h.id), label: h.po_number }))
  if (lines.some((l) => l.parent_po_id == null)) poOptions.push({ value: NO_PO_KEY, label: 'No PO (older orders)' })

  function linesForPo(poKey) {
    if (!poKey) return []
    return poKey === NO_PO_KEY ? lines.filter((l) => l.parent_po_id == null) : lines.filter((l) => String(l.parent_po_id) === poKey)
  }

  const lineOptions = linesForPo(form.po_key).map((l) => {
    const name = products.find((p) => p.part_serial_number === l.part_serial_number)?.part_name
    const part = name ? `${l.part_serial_number} – ${name}` : l.part_serial_number
    return { value: String(l.order_line_id), label: `${part} (${l.remaining_qty} of ${l.order_qty} to plan)` }
  })

  function selectLine(lineId, poKey) {
    const line = lines.find((l) => String(l.order_line_id) === String(lineId))
    const size = masterBatchSizeFor(batchMaster, line?.part_serial_number)
    setForm((f) => ({ po_key: poKey, line_id: lineId ? String(lineId) : '', shift_hours: f.shift_hours }))
    setSplit(line ? suggestSplit(line.remaining_qty, size).map((qty) => ({ qty: String(qty), plan: true })) : [])
    setNotice('')
  }

  function handleSelectPo(e) {
    const poKey = e.target.value
    const poLines = linesForPo(poKey)
    selectLine(poLines.length === 1 ? poLines[0].order_line_id : '', poKey)
  }

  const setRow = (i, patch) => setSplit((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  function handleReset() {
    setForm(EMPTY_FORM)
    setSplit([])
    setViewedPrd(null)
    setRouteCardPrd(null)
    setError(null)
  }

  async function handleSave() {
    setError(null)
    setNotice('')
    if (!selectedLine) {
      setError('Select a Customer PO No and Part first.')
      return
    }
    if (check.errors.length) {
      setError(check.errors.join(' '))
      return
    }
    if (!form.shift_hours || Number(form.shift_hours) <= 0) {
      setError('Shift Hours must be greater than 0.')
      return
    }
    setSaving(true)
    try {
      // Block when any BOM material is short for the batches planned now --
      // stock re-fetched at the moment of saving. No override.
      const balance = await listRawMaterialStockBalance()
      const short = materialAvailability
        .map((m) => {
          const stock = balance.find((b) => b.raw_material_code === m.raw_material_code)?.current_stock ?? 0
          const need = check.plannedTotal * m.consumption_per_unit
          return { code: m.raw_material_code, shortBy: need - stock }
        })
        .filter((m) => m.shortBy > 0)
      if (short.length) {
        setError(`Cannot save -- insufficient raw material stock: ${short.map((m) => `${m.code} short by ${m.shortBy}`).join('; ')}.`)
        return
      }
      const created = await planProductionOrders({
        orderLineId: selectedLine.order_line_id,
        partSerialNumber: selectedLine.part_serial_number,
        batches: check.planned,
        shiftHours: form.shift_hours,
        availableRmQtySnapshot: hasBom ? materialAvailability[0].current_stock : null,
        unitsProducible: hasBom ? unitsProducible : null,
      })
      const prdNos = (created ?? []).map((p) => p.prd_no)
      const left = selectedLine.remaining_qty - check.plannedTotal
      handleReset()
      await refresh()
      setNotice(`Planned ${prdNos.join(', ')}${left > 0 ? ` -- ${left} still to plan on this PO line.` : ' -- PO line fully planned.'}`)
      if (prdNos[0]) setRouteCardPrd(prdNos[0])
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelPrd(row) {
    const reason = prompt(`Cancel ${row.prd_no} (${row.prd_qty} pcs)? Its qty goes back to the PO line. Reason:`)
    if (reason == null) return
    if (!reason.trim()) {
      setError('A reason is required to cancel a PRD.')
      return
    }
    setError(null)
    try {
      await cancelProductionOrder(row.prd_no, reason.trim())
      if (viewedPrd === row.prd_no) setViewedPrd(null)
      if (routeCardPrd === row.prd_no) setRouteCardPrd(null)
      await refresh()
      setNotice(`${row.prd_no} cancelled -- ${row.prd_qty} returned to PO ${row.po_number}.`)
    } catch (e) {
      setError(e.message)
    }
  }

  const filteredPlans = plans.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [p.customer_order_no, p.jc_no, p.po_number, p.customer_name, p.part_name].some((v) => String(v ?? '').toLowerCase().includes(q))
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Production Planning" subtitle="Plan Today | Produce Efficiently | Deliver On Time" />

      {/* Shared toolbar (New / Save / Clear / Print). Plans are never edited
          here; a PRD that has not started can be cancelled from the list. */}
      <ActionToolbar
        showEditDelete={false}
        saving={saving}
        canSave={!check || check.errors.length === 0}
        onNew={handleReset}
        onSave={handleSave}
        onClear={() => {
          handleReset()
          setSearch('')
        }}
        onExportExcel={() => exportToCsv(LIST_COLUMNS, filteredPlans, 'production_planning.csv')}
        onExportPdf={() => exportToPdf(LIST_COLUMNS, filteredPlans, 'Production Planning', 'production_planning')}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && <Banner tone="error" message={error} />}
        {notice && <Banner tone="success" message={notice} onClose={() => setNotice(null)} />}

        <FormSection icon={ClipboardList} title="1. Production Planning Details" subtitle="Pick a PO line to plan" columns={2}>
          <Field label="Customer PO No" required>
            <SearchableSelect value={form.po_key} onChange={handleSelectPo} options={poOptions} />
          </Field>
          <Field label="Part (PO line)" required>
            <SearchableSelect value={form.line_id} onChange={(e) => selectLine(e.target.value, form.po_key)} options={lineOptions} disabled={!form.po_key} />
          </Field>
          <Field label="Customer Name">
            <AutoFillBox value={selectedCustomer?.customer_name ?? ''} />
          </Field>
          <Field label="Part Serial Number">
            <AutoFillBox value={selectedLine?.part_serial_number ?? ''} />
          </Field>
          <Field label="Part Name">
            <AutoFillBox value={selectedProduct?.part_name ?? ''} />
          </Field>
          <Field label="Part Drawing Reference Number">
            <AutoFillBox value={selectedProduct?.part_drawing_reference_number ?? ''} />
          </Field>
          <Field label="PO Line Order Qty">
            <AutoFillBox value={selectedLine?.order_qty ?? ''} unit="Nos" />
          </Field>
          <Field label="Already Planned">
            <AutoFillBox value={selectedLine ? `${selectedLine.planned_qty}${selectedLine.prds.length ? ` (${selectedLine.prds.join(', ')})` : ''}` : ''} />
          </Field>
          <Field label="Left To Plan">
            <AutoFillBox value={selectedLine?.remaining_qty ?? ''} unit="Nos" />
          </Field>
          <Field label="Expected Date of Delivery">
            <AutoFillBox value={selectedLine?.expected_delivery ?? ''} />
          </Field>
          <Field label="Available RM Qty Stock">
            <AutoFillBox value={availableRmQtyDisplay} unit={rmUnit} />
          </Field>
          <Field label="Total Units Can Be Produced">
            <AutoFillBox value={hasBom ? unitsProducible : 'Pending BOM'} unit={hasBom ? 'Nos' : undefined} />
          </Field>
          <Field label="Shift Hours" required>
            <TextInput type="number" value={form.shift_hours} onChange={(e) => setForm((f) => ({ ...f, shift_hours: e.target.value }))} />
          </Field>
        </FormSection>

        {selectedLine && (
          <FormSection
            icon={Layers}
            title="2. Batches (one PRD each)"
            subtitle={masterBatchSize ? `Suggested from Production Batch Master: max ${masterBatchSize} per PRD` : 'No batch size in Production Batch Master: one PRD'}
            columns={1}
          >
            <div className="w-full space-y-1.5">
              <table className="w-full max-w-[560px] text-[13px]">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Batch</th>
                    <th className="pr-3 font-medium">Qty (Nos)</th>
                    <th className="pr-3 font-medium">Plan now</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {split.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1 pr-3">{i + 1}</td>
                      <td className="pr-3">
                        <TextInput type="number" aria-label={`Batch ${i + 1} qty`} aria-invalid={Boolean(check.rowErrors[i])} value={row.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
                        {check.rowErrors[i] && <p role="alert" className="mt-0.5 text-[12px] text-red-600">{check.rowErrors[i]}</p>}
                      </td>
                      <td className="pr-3">
                        <input type="checkbox" aria-label={`Plan batch ${i + 1} now`} checked={row.plan} onChange={(e) => setRow(i, { plan: e.target.checked })} />
                      </td>
                      <td>
                        <button type="button" aria-label={`Remove batch ${i + 1}`} onClick={() => setSplit((rows) => rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <button type="button" onClick={() => setSplit((rows) => [...rows, { qty: '', plan: true }])} className="inline-flex items-center gap-1 text-bmlhblue hover:underline">
                  <Plus size={13} /> Add batch
                </button>
                <button type="button" onClick={() => selectLine(form.line_id, form.po_key)} className="text-bmlhblue hover:underline">
                  Reset to suggestion
                </button>
                <span className="text-slate-600">
                  Total {check.total} of {selectedLine.remaining_qty} · planning now {check.planned.length} PRD(s), {check.plannedTotal} pcs
                </span>
              </div>
              {check.errors.map((m) => <p key={m} className="text-[13px] text-red-600">{m}</p>)}
            </div>
          </FormSection>
        )}

        {routeCardPrd && <JobRouteCardSheet prdNo={routeCardPrd} onClose={() => setRouteCardPrd(null)} />}

        {viewedPrd && (
          <StageTraceTable prdNo={viewedPrd} title={`Route Card Stages for ${viewedPrd}`} card={plans.find((p) => p.prd_no === viewedPrd)} />
        )}

        <RecordsList
          title="Production Planning List"
          columns={[
            ...LIST_COLUMNS,
            {
              key: 'action',
              label: 'Action',
              render: (r) => (
                <span className="inline-flex items-center gap-3">
                  <button className="inline-flex items-center gap-1 text-bmlhblue hover:underline text-sm" onClick={() => setViewedPrd(r.prd_no)}>
                    <Eye size={14} /> View
                  </button>
                  <button className="inline-flex items-center gap-1 text-bmlhblue hover:underline text-sm" onClick={() => setRouteCardPrd(r.prd_no)}>
                    <Route size={14} /> Route Card
                  </button>
                  {r.can_cancel && r.has_production_logs && (
                    <button
                      type="button"
                      disabled
                      title={CANCEL_BLOCKED}
                      aria-label={CANCEL_BLOCKED}
                      className="inline-flex items-center gap-1 text-slate-400 cursor-not-allowed text-sm"
                    >
                      <Ban size={14} /> Cancel
                    </button>
                  )}
                  {r.can_cancel && !r.has_production_logs && (
                    <button className="inline-flex items-center gap-1 text-red-600 hover:underline text-sm" onClick={() => handleCancelPrd(r)}>
                      <Ban size={14} /> Cancel
                    </button>
                  )}
                </span>
              ),
            },
          ]}
          rows={filteredPlans}
          rowKey="prd_no"
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by PRD / JC / PO / Customer / Product..."
        />
        <div className="text-xs text-gray-500 px-1">Total Records: {filteredPlans.length}</div>
      </div>
    </div>
  )
}
