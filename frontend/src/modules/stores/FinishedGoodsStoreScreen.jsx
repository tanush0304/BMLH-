import { useEffect, useState } from 'react'
import { PackageCheck, RotateCcw, X, ClipboardList, Trash2, Plus, Save } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import StatusPill from '../../components/StatusPill'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { listOperators } from '../../data/queries/operators'
import { listShifts } from '../../data/queries/shifts'
import {
  listFinishedGoodsStockBalance,
  listFinishedGoodsTransactions,
  listFinishedGoodsOrderStatus,
  createFinishedGoodsTransaction,
  deleteFinishedGoodsTransaction,
} from '../../data/queries/finishedGoodsStock'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const EMPTY_FORM = {
  operator_emp_id: '',
  shift_code: '',
  transaction_date: todayISO(),
  prd_no: '',
  qty: '',
}

const TXN_COLUMNS = [
  { key: 'transaction_date', label: 'Date' },
  { key: 'operator_emp_id', label: 'User ID' },
  { key: 'user_name', label: 'User Name' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'prd_no', label: 'Production Order No.' },
  { key: 'product_code', label: 'Product Code' },
  { key: 'order_qty', label: 'Order Qty (Nos)' },
  { key: 'qty_in_stock', label: 'Qty in Stock (Nos)' },
  { key: 'qty_received', label: 'Qty Received (Nos)' },
  { key: 'qty', label: 'Despatch Qty (Nos)' },
  { key: 'balance_to_dispatch', label: 'Balance Qty (Nos)' },
  { key: 'order_status', label: 'Order Status', type: 'status' },
]

export default function FinishedGoodsStoreScreen() {
  const [orders, setOrders] = useState([])
  const [operators, setOperators] = useState([])
  const [shifts, setShifts] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [orderStatus, setOrderStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [ords, ops, shf, bal, txns, status] = await Promise.all([
        listCustomerOrders(),
        listOperators(),
        listShifts(),
        listFinishedGoodsStockBalance(),
        listFinishedGoodsTransactions(),
        listFinishedGoodsOrderStatus(),
      ])
      setOrders(ords)
      setOperators(ops)
      setShifts(shf)
      setBalances(bal)
      setTransactions(txns)
      setOrderStatus(status)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function operatorName(id) {
    return operators.find((o) => o.operator_emp_id === id)?.operator_name ?? ''
  }

  const selectedOrder = orders.find((o) => o.prd_no === form.prd_no)
  const selectedStatus = orderStatus.find((s) => s.prd_no === form.prd_no)
  const qtyInStockForProduct = (productCode) =>
    balances.find((b) => b.product_code === productCode)?.current_stock ?? ''
  const qtyReceivedForPrd = (prdNo) =>
    transactions
      .filter((t) => t.prd_no === prdNo && t.transaction_type === 'Production Receipt')
      .reduce((sum, t) => sum + Number(t.qty || 0), 0)

  function handleReset() {
    setForm(EMPTY_FORM)
    setError(null)
  }

  async function handleSave() {
    if (!form.operator_emp_id || !form.shift_code || !form.prd_no || !form.qty || !form.transaction_date) {
      setError('User ID, Shift, Production Order Number, Despatch Quantity and Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createFinishedGoodsTransaction({
        product_code: selectedOrder?.product_code,
        transaction_type: 'Dispatch',
        qty: Number(form.qty),
        transaction_date: form.transaction_date,
        prd_no: form.prd_no,
        customer_id: selectedOrder?.customer_id ?? null,
        operator_emp_id: form.operator_emp_id,
        shift_code: form.shift_code,
      })
      handleReset()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRow(id) {
    if (!confirm('Delete this despatch record? This cannot be undone.')) return
    setSaving(true)
    setError(null)
    try {
      await deleteFinishedGoodsTransaction(id)
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const dispatchRows = transactions
    .filter((t) => t.transaction_type === 'Dispatch')
    .map((t) => {
      const order = orders.find((o) => o.prd_no === t.prd_no)
      const status = orderStatus.find((s) => s.prd_no === t.prd_no)
      return {
        ...t,
        user_name: operatorName(t.operator_emp_id),
        order_qty: order?.order_qty ?? '',
        qty_in_stock: qtyInStockForProduct(t.product_code),
        qty_received: qtyReceivedForPrd(t.prd_no),
        balance_to_dispatch: status?.balance_to_dispatch ?? '',
        order_status: status?.order_status ?? '',
      }
    })

  const filteredRows = dispatchRows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.transaction_date?.toLowerCase().includes(q) ||
      r.prd_no?.toLowerCase().includes(q) ||
      r.product_code?.toLowerCase().includes(q)
    )
  })

  const columnsWithAction = [
    ...TXN_COLUMNS,
    {
      key: 'action',
      label: 'Action',
      render: (row) => (
        <button onClick={() => handleDeleteRow(row.id)} title="Delete">
          <Trash2 size={15} className="text-red-500" />
        </button>
      ),
    },
  ]

  const btn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium disabled:opacity-40'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        eyebrow="Stores Module"
        title="Finished Goods Issue"
        subtitle="Right Product  |  Right Quantity  |  On Time Delivery"
      />

      <div className="flex flex-wrap items-center gap-2 bg-white border-b border-gray-200 px-6 py-3">
        <button className={`${btn} bg-green-600 text-white hover:bg-green-700`} onClick={handleReset}>
          <Plus size={16} /> New
        </button>
        <button
          className={`${btn} bg-bmlhblue text-white hover:bg-[#163d70]`}
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save'}
        </button>
        <button className={`${btn} bg-bmlhslate text-white hover:bg-[#767e8c]`} onClick={handleReset}>
          <RotateCcw size={16} /> Reset
        </button>
        <button className={`${btn} bg-bmlhslate text-white hover:bg-[#767e8c]`} onClick={handleReset}>
          <X size={16} /> Cancel
        </button>
        <div className="w-px self-stretch bg-gray-200 mx-1" />
        <button
          className={`${btn} bg-bmlhsky text-bmlhblue hover:bg-[#c9def6] ml-auto`}
          onClick={() => setSearch('')}
        >
          <ClipboardList size={16} /> View Issue History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={PackageCheck} title="Stores Module - Finished Goods Issue Details" columns={2}>
          <Field label="User ID" required>
            <SelectInput
              value={form.operator_emp_id}
              onChange={handleField('operator_emp_id')}
              options={operators.map((o) => ({ value: o.operator_emp_id, label: o.operator_emp_id }))}
            />
          </Field>
          <Field label="Order Quantity">
            <AutoFillBox value={selectedOrder?.order_qty} unit="Nos" />
          </Field>

          <Field label="User Name">
            <AutoFillBox value={operatorName(form.operator_emp_id)} />
          </Field>
          <Field label="Quantity in Stock">
            <AutoFillBox value={qtyInStockForProduct(selectedOrder?.product_code)} unit="Nos" />
          </Field>

          <Field label="Shift" required>
            <SelectInput
              value={form.shift_code}
              onChange={handleField('shift_code')}
              options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name || s.shift_code }))}
            />
          </Field>
          <Field label="Quantity Received">
            <AutoFillBox value={qtyReceivedForPrd(form.prd_no)} unit="Nos" />
          </Field>

          <Field label="Date" required>
            <TextInput type="date" value={form.transaction_date} onChange={handleField('transaction_date')} />
          </Field>
          <Field label="Despatch Quantity" required>
            <div className="flex rounded overflow-hidden border border-gray-300">
              <input
                type="number"
                value={form.qty}
                onChange={handleField('qty')}
                placeholder="Enter Quantity"
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
              />
              <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border-l border-gray-300">Nos</span>
            </div>
          </Field>

          <Field label="Production Order number" required>
            <SelectInput value={form.prd_no} onChange={handleField('prd_no')} options={orders.map((o) => o.prd_no)} />
          </Field>
          <Field label="Balance Quantity to be despatched">
            <AutoFillBox value={selectedStatus?.balance_to_dispatch} unit="Nos" />
          </Field>

          <Field label="Product Code">
            <AutoFillBox value={selectedOrder?.product_code} />
          </Field>
          <Field label="Order Status">
            <div className="flex items-center h-[38px]">
              {selectedStatus?.order_status ? <StatusPill status={selectedStatus.order_status} /> : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
          </Field>
        </FormSection>

        <RecordsList
          title="Finished Goods Issue List"
          columns={columnsWithAction}
          rows={filteredRows}
          loading={loading}
          error={null}
          rowKey="id"
          searchValue={search}
          onSearchChange={setSearch}
        />
      </div>
    </div>
  )
}
