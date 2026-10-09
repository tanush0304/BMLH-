import { useEffect, useState } from 'react'
import { Plus, Save, RotateCcw, X, ListChecks, ClipboardList, Eye, Route } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
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
import { generateRouteCard } from '../../data/queries/routeCards'
import { listRawMaterialStockBalance } from '../../data/queries/rawMaterialStock'
import { listOrderMaterialRequirement, listOrderMaterialShortfall } from '../../data/queries/rawMaterialRequisitions'

const LIST_COLUMNS = [
  { key: 'jc_no', label: 'JC No' },
  { key: 'customer_order_no', label: 'Customer Order No' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'part_drawing_reference_number', label: 'Part Drawing Number' },
  { key: 'order_qty', label: 'Order Qty' },
  { key: 'expected_delivery', label: 'Expected Delivery' },
  { key: 'available_rm_qty_snapshot', label: 'Available RM Qty', render: (r) => r.available_rm_qty_snapshot ?? 'Pending BOM' },
  { key: 'units_producible', label: 'Total Units Can Be Produced', render: (r) => r.units_producible ?? 'Pending BOM' },
  { key: 'batch_qty', label: 'Planned Batch Qty' },
  { key: 'status', label: 'Status', type: 'status' },
]

const EMPTY_FORM = { po_key: '', prd_no: '', batch_qty: '', shift_hours: '' }

// Dropdown 1 value for older flat orders saved before PO headers existed
// (customer orders.parent_po_id is null).
const NO_PO_KEY = 'no-po'

export default function ProductionPlanningScreen() {
  const [orders, setOrders] = useState([])
  const [poHeaders, setPoHeaders] = useState([])
  const [plans, setPlans] = useState([])
  const [batches, setBatches] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [materialRequirement, setMaterialRequirement] = useState([])
  const [stockBalance, setStockBalance] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [viewedPrd, setViewedPrd] = useState(null)
  const [routeCardPrd, setRouteCardPrd] = useState(null)

  async function refresh() {
    const [availableOrders, poHeaderRows, planRows, batchRows, customerRows, productRows, requirementRows, balanceRows] = await Promise.all([
      listOrdersAvailableForPlanning(),
      listPoHeaders(),
      listProductionPlans(),
      listProductionBatches(),
      listCustomers(),
      listProducts(),
      listOrderMaterialRequirement(),
      listRawMaterialStockBalance(),
    ])
    setOrders(availableOrders)
    setPoHeaders(poHeaderRows)
    setPlans(planRows)
    setBatches(batchRows)
    setCustomers(customerRows)
    setProducts(productRows)
    setMaterialRequirement(requirementRows)
    setStockBalance(balanceRows)
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [])

  const selectedOrder = orders.find((o) => o.prd_no === form.prd_no)
  const selectedCustomer = customers.find((c) => c.customer_id === selectedOrder?.customer_id)
  const selectedProduct = products.find((p) => p.part_serial_number === selectedOrder?.part_serial_number)

  // "order material requirement" only has a row for a PRD whose product has
  // at least one Bill of Materials entry -- no row means no BOM yet, so we
  // keep showing "Pending BOM" for that product rather than guessing or
  // erroring. consumption_per_unit lives on the requirement view; current
  // stock comes from "raw material stock balance" per the material it names.
  const requirementRowsForOrder = materialRequirement.filter((r) => r.prd_no === form.prd_no)
  const materialAvailability = requirementRowsForOrder.map((r) => {
    const stock = stockBalance.find((b) => b.raw_material_code === r.raw_material_code)?.current_stock ?? 0
    return {
      raw_material_code: r.raw_material_code,
      current_stock: stock,
      units_producible: r.consumption_per_unit > 0 ? Math.floor(stock / r.consumption_per_unit) : null,
    }
  })
  const hasBom = materialAvailability.length > 0
  // With more than one material (rare -- most products use exactly one),
  // the order's real capacity is bottlenecked by whichever material runs
  // out first.
  const unitsProducible = hasBom ? Math.min(...materialAvailability.map((m) => m.units_producible)) : null
  const availableRmQtyDisplay = hasBom
    ? materialAvailability.length === 1
      ? materialAvailability[0].current_stock
      : materialAvailability.map((m) => `${m.raw_material_code}: ${m.current_stock}`).join(', ')
    : 'Pending BOM'

  // Dropdown 1: only POs that still have at least one unplanned line
  // (orders is already filtered to PRDs without a route card).
  const poOptions = poHeaders
    .filter((h) => orders.some((o) => o.parent_po_id === h.id))
    .map((h) => ({ value: String(h.id), label: h.po_number }))
  if (orders.some((o) => o.parent_po_id == null)) {
    poOptions.push({ value: NO_PO_KEY, label: 'No PO (older orders)' })
  }

  function linesForPo(poKey) {
    if (!poKey) return []
    return poKey === NO_PO_KEY
      ? orders.filter((o) => o.parent_po_id == null)
      : orders.filter((o) => String(o.parent_po_id) === poKey)
  }

  const partOptions = linesForPo(form.po_key).map((o) => {
    const name = products.find((p) => p.part_serial_number === o.part_serial_number)?.part_name
    return { value: o.prd_no, label: name ? `${o.part_serial_number} – ${name}` : o.part_serial_number }
  })

  function selectPrd(prd, poKey) {
    const order = orders.find((o) => o.prd_no === prd)
    const batch = batches.find((b) => b.part_serial_number === order?.part_serial_number)
    setForm((f) => ({ po_key: poKey, prd_no: prd, batch_qty: batch?.production_batch_quantity ?? '', shift_hours: f.shift_hours }))
  }

  function handleSelectPo(e) {
    const poKey = e.target.value
    const lines = linesForPo(poKey)
    // A PO with a single line needs no second choice.
    selectPrd(lines.length === 1 ? lines[0].prd_no : '', poKey)
  }

  function handleSelectPrd(e) {
    selectPrd(e.target.value, form.po_key)
  }

  function handleReset() {
    setForm(EMPTY_FORM)
    setViewedPrd(null)
    setRouteCardPrd(null)
    setError(null)
  }

  function handleViewPlanList() {
    setViewedPrd(null)
    setSearch('')
  }

  async function handleSave() {
    setError(null)
    if (!form.prd_no) {
      setError('Select a Customer PO No and Part first.')
      return
    }
    if (!form.batch_qty || Number(form.batch_qty) <= 0) {
      setError('Planned production batch quantity must be greater than 0.')
      return
    }
    if (!form.shift_hours || Number(form.shift_hours) <= 0) {
      setError('Shift Hours must be greater than 0.')
      return
    }
    setSaving(true)
    try {
      // BMLH's decision: block saving outright when any required material
      // falls short -- re-fetched here rather than reusing the on-screen
      // figures, so the check reflects current stock at the moment of
      // saving, not whatever was last loaded. No override.
      const shortfallRows = (await listOrderMaterialShortfall()).filter(
        (r) => r.prd_no === form.prd_no && r.shortfall > 0
      )
      if (shortfallRows.length > 0) {
        const detail = shortfallRows.map((r) => `${r.raw_material_code} short by ${r.shortfall}`).join('; ')
        setError(`Cannot save -- insufficient raw material stock: ${detail}.`)
        setSaving(false)
        return
      }

      // Keep one route card per PRD (current primary key). Open question: should
      // planning instead be per-batch when order_qty exceeds batch_qty? Not
      // changing the key until the client confirms -- see spec discussion.
      await generateRouteCard({
        prdNo: form.prd_no,
        partSerialNumber: selectedOrder?.part_serial_number,
        batchQty: form.batch_qty,
        shiftHours: form.shift_hours,
        availableRmQtySnapshot: hasBom ? materialAvailability[0].current_stock : null,
        unitsProducible: hasBom ? unitsProducible : null,
      })
      const savedPrd = form.prd_no
      handleReset()
      await refresh()
      // Show the Job Route Card that was just generated.
      setRouteCardPrd(savedPrd)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredPlans = plans.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      p.customer_order_no?.toLowerCase().includes(q) ||
      p.customer_name?.toLowerCase().includes(q) ||
      p.part_name?.toLowerCase().includes(q)
    )
  })

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40'

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Production Planning" subtitle="Plan Today | Produce Efficiently | Deliver On Time" />

      <div className="flex flex-wrap items-center gap-2 bg-white border-b border-gray-200 px-4 py-1.5">
        <button className={`${btn} bg-green-600 text-white hover:bg-green-700`} onClick={handleReset}>
          <Plus size={16} /> New
        </button>
        <button className={`${btn} bg-bmlhblue text-white hover:bg-[#163d70]`} onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save'}
        </button>
        <button className={`${btn} bg-bmlhslate text-white hover:bg-[#767e8c]`} onClick={handleReset}>
          <RotateCcw size={16} /> Reset
        </button>
        <button className={`${btn} bg-bmlhslate text-white hover:bg-[#767e8c]`} onClick={handleReset}>
          <X size={16} /> Cancel
        </button>
        <div className="w-px self-stretch bg-gray-200 mx-1" />
        <button className={`${btn} bg-bmlhsky text-bmlhblue hover:bg-[#c9def6] ml-auto`} onClick={handleViewPlanList}>
          <ListChecks size={16} /> View Plan List
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>
        )}

        <FormSection icon={ClipboardList} title="Production Planning Details" subtitle="Plan an order into production" columns={2}>
          <Field label="Customer PO No" required>
            <SearchableSelect value={form.po_key} onChange={handleSelectPo} options={poOptions} />
          </Field>
          <Field label="Part" required>
            <SearchableSelect value={form.prd_no} onChange={handleSelectPrd} options={partOptions} disabled={!form.po_key} />
          </Field>
          <Field label="PRD No">
            <AutoFillBox value={form.prd_no} />
          </Field>
          <Field label="Customer Name">
            <AutoFillBox value={selectedCustomer?.customer_name ?? ''} />
          </Field>
          <Field label="Part Serial Number">
            <AutoFillBox value={selectedOrder?.part_serial_number ?? ''} />
          </Field>
          <Field label="Part Name">
            <AutoFillBox value={selectedProduct?.part_name ?? ''} />
          </Field>
          <Field label="Part Drawing Reference Number">
            <AutoFillBox value={selectedProduct?.part_drawing_reference_number ?? ''} />
          </Field>
          <Field label="Order Qty">
            <AutoFillBox value={selectedOrder?.order_qty ?? ''} unit="Nos" />
          </Field>
          <Field label="Expected Date of Delivery">
            <AutoFillBox value={selectedOrder?.expected_delivery ?? ''} />
          </Field>
          <Field label="Available RM Qty Stock">
            <AutoFillBox value={availableRmQtyDisplay} unit={hasBom ? 'Nos' : undefined} />
          </Field>
          <Field label="Total Units Can Be Produced">
            <AutoFillBox value={hasBom ? unitsProducible : 'Pending BOM'} unit={hasBom ? 'Nos' : undefined} />
          </Field>
          <Field label="Planned Production Batch Quantity" required>
            {/* Prefilled from Production Batch Master by part_serial_number; left
                editable pending client confirmation on whether this should be
                overridable. Empty when the product has no batch master row --
                manual entry is required in that case. */}
            <TextInput
              type="number"
              value={form.batch_qty}
              onChange={(e) => setForm((f) => ({ ...f, batch_qty: e.target.value }))}
            />
          </Field>
          <Field label="Shift Hours" required>
            <TextInput
              type="number"
              value={form.shift_hours}
              onChange={(e) => setForm((f) => ({ ...f, shift_hours: e.target.value }))}
            />
          </Field>
        </FormSection>

        {routeCardPrd && <JobRouteCardSheet prdNo={routeCardPrd} onClose={() => setRouteCardPrd(null)} />}

        {viewedPrd && (
          <StageTraceTable
            prdNo={viewedPrd}
            title={`Route Card Stages for ${viewedPrd}`}
            card={plans.find((p) => p.prd_no === viewedPrd)}
          />
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
                  <button
                    className="inline-flex items-center gap-1 text-bmlhblue hover:underline text-sm"
                    onClick={() => setViewedPrd(r.prd_no)}
                  >
                    <Eye size={14} /> View
                  </button>
                  <button
                    className="inline-flex items-center gap-1 text-bmlhblue hover:underline text-sm"
                    onClick={() => setRouteCardPrd(r.prd_no)}
                  >
                    <Route size={14} /> Route Card
                  </button>
                </span>
              ),
            },
          ]}
          rows={filteredPlans}
          rowKey="prd_no"
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by Order No / Customer / Product..."
        />
        <div className="text-xs text-gray-500 px-1">Total Records: {filteredPlans.length}</div>
      </div>
    </div>
  )
}
