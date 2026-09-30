import { useEffect, useState } from 'react'
import { Plus, Save, RotateCcw, X, ListChecks, ClipboardList, Eye } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput, TextInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import StageTraceTable from '../../components/StageTraceTable'
import { listOrdersAvailableForPlanning, listProductionPlans } from '../../data/queries/productionPlanning'
import { listProductionBatches } from '../../data/queries/productionBatch'
import { listCustomers } from '../../data/queries/customers'
import { listProducts } from '../../data/queries/products'
import { generateRouteCard } from '../../data/queries/routeCards'

const LIST_COLUMNS = [
  { key: 'customer_order_no', label: 'Customer Order No' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'product_code', label: 'Product Code' },
  { key: 'product_name', label: 'Product Name' },
  { key: 'order_qty', label: 'Order Qty' },
  { key: 'expected_delivery', label: 'Expected Delivery' },
  { key: 'available_rm_qty_snapshot', label: 'Available RM Qty', render: (r) => r.available_rm_qty_snapshot ?? 'Pending BOM' },
  { key: 'units_producible', label: 'Total Units Can Be Produced', render: (r) => r.units_producible ?? 'Pending BOM' },
  { key: 'batch_qty', label: 'Planned Batch Qty' },
  { key: 'status', label: 'Status', type: 'status' },
]

const EMPTY_FORM = { prd_no: '', batch_qty: '', shift_hours: '' }

export default function ProductionPlanningScreen() {
  const [orders, setOrders] = useState([])
  const [plans, setPlans] = useState([])
  const [batches, setBatches] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [viewedPrd, setViewedPrd] = useState(null)

  async function refresh() {
    const [availableOrders, planRows, batchRows, customerRows, productRows] = await Promise.all([
      listOrdersAvailableForPlanning(),
      listProductionPlans(),
      listProductionBatches(),
      listCustomers(),
      listProducts(),
    ])
    setOrders(availableOrders)
    setPlans(planRows)
    setBatches(batchRows)
    setCustomers(customerRows)
    setProducts(productRows)
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [])

  const selectedOrder = orders.find((o) => o.prd_no === form.prd_no)
  const selectedCustomer = customers.find((c) => c.customer_id === selectedOrder?.customer_id)
  const selectedProduct = products.find((p) => p.product_code === selectedOrder?.product_code)

  function handleSelectPrd(e) {
    const prd = e.target.value
    const order = orders.find((o) => o.prd_no === prd)
    const batch = batches.find((b) => b.product_code === order?.product_code)
    setForm((f) => ({ prd_no: prd, batch_qty: batch?.production_batch_quantity ?? '', shift_hours: f.shift_hours }))
  }

  function handleReset() {
    setForm(EMPTY_FORM)
    setViewedPrd(null)
    setError(null)
  }

  function handleViewPlanList() {
    setViewedPrd(null)
    setSearch('')
  }

  async function handleSave() {
    setError(null)
    if (!form.prd_no) {
      setError('Select a Customer Order No first.')
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
      // Keep one route card per PRD (current primary key). Open question: should
      // planning instead be per-batch when order_qty exceeds batch_qty? Not
      // changing the key until the client confirms -- see spec discussion.
      await generateRouteCard({
        prdNo: form.prd_no,
        productCode: selectedOrder?.product_code,
        batchQty: form.batch_qty,
        shiftHours: form.shift_hours,
      })
      handleReset()
      await refresh()
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
      p.product_name?.toLowerCase().includes(q)
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
          <Field label="Customer Order No" required>
            <SelectInput value={form.prd_no} onChange={handleSelectPrd} options={orders.map((o) => o.prd_no)} />
          </Field>
          <Field label="Customer Name">
            <AutoFillBox value={selectedCustomer?.customer_name ?? ''} />
          </Field>
          <Field label="Product Code">
            <AutoFillBox value={selectedOrder?.product_code ?? ''} />
          </Field>
          <Field label="Product Name">
            <AutoFillBox value={selectedProduct?.product_name ?? ''} />
          </Field>
          <Field label="Order Qty">
            <AutoFillBox value={selectedOrder?.order_qty ?? ''} unit="Nos" />
          </Field>
          <Field label="Expected Date of Delivery">
            <AutoFillBox value={selectedOrder?.expected_delivery ?? ''} />
          </Field>
          <Field label="Available RM Qty Stock">
            {/* TODO: no product-to-raw-material link exists in the schema yet
                (needs a BOM table). Do not invent a formula -- shown as
                "Pending BOM" and saved as null (available_rm_qty_snapshot). */}
            <AutoFillBox value="Pending BOM" unit="Nos" />
          </Field>
          <Field label="Total Units Can Be Produced">
            {/* TODO: same BOM gap as above -- saved as null (units_producible). */}
            <AutoFillBox value="Pending BOM" unit="Nos" />
          </Field>
          <Field label="Planned Production Batch Quantity" required>
            {/* Prefilled from Production Batch Master by product_code; left
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
                <button
                  className="inline-flex items-center gap-1 text-bmlhblue hover:underline text-sm"
                  onClick={() => setViewedPrd(r.prd_no)}
                >
                  <Eye size={14} /> View
                </button>
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
