import { useEffect, useState } from 'react'
import { PackageCheck, RotateCcw, X, ClipboardList, Trash2, Plus, Save, PackagePlus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import StatusPill from '../../components/StatusPill'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { listUsers } from '../../data/queries/users'
import { listShifts } from '../../data/queries/shifts'
import { getCurrentUserId } from '../../data/queries/currentUser'
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

const EMPTY_DISPATCH_FORM = {
  user_emp_id: '',
  shift_code: '',
  transaction_date: todayISO(),
  prd_no: '',
  qty: '',
}

const EMPTY_RECEIPT_FORM = {
  user_emp_id: '',
  shift_code: '',
  transaction_date: todayISO(),
  prd_no: '',
  qty: '',
}

const DISPATCH_COLUMNS = [
  { key: 'transaction_date', label: 'Date' },
  { key: 'user_emp_id', label: 'User ID' },
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

const RECEIPT_COLUMNS = [
  { key: 'transaction_date', label: 'Date' },
  { key: 'user_emp_id', label: 'User ID' },
  { key: 'user_name', label: 'User Name' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'prd_no', label: 'Production Order No.' },
  { key: 'product_code', label: 'Product Code' },
  { key: 'qty', label: 'Qty Received (Nos)' },
]

export default function FinishedGoodsStoreScreen() {
  const [mode, setMode] = useState('dispatch') // 'dispatch' | 'production-receipt'
  const [orders, setOrders] = useState([])
  const [users, setUsers] = useState([])
  const [shifts, setShifts] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [orderStatus, setOrderStatus] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [dispatchForm, setDispatchForm] = useState(EMPTY_DISPATCH_FORM)
  const [receiptForm, setReceiptForm] = useState(EMPTY_RECEIPT_FORM)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [ords, usrs, shf, bal, txns, status, userId] = await Promise.all([
        listCustomerOrders(),
        listUsers(),
        listShifts(),
        listFinishedGoodsStockBalance(),
        listFinishedGoodsTransactions(),
        listFinishedGoodsOrderStatus(),
        getCurrentUserId(),
      ])
      setOrders(ords)
      setUsers(usrs)
      setShifts(shf)
      setBalances(bal)
      setTransactions(txns)
      setOrderStatus(status)
      setCurrentUserId(userId)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleDispatchField(key) {
    return (e) => setDispatchForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleReceiptField(key) {
    return (e) => setReceiptForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function userName(id) {
    return users.find((o) => o.user_emp_id === id)?.user_name ?? ''
  }

  const selectedDispatchOrder = orders.find((o) => o.prd_no === dispatchForm.prd_no)
  const selectedDispatchStatus = orderStatus.find((s) => s.prd_no === dispatchForm.prd_no)
  const selectedReceiptOrder = orders.find((o) => o.prd_no === receiptForm.prd_no)

  const qtyInStockForProduct = (productCode) =>
    balances.find((b) => b.product_code === productCode)?.current_stock ?? ''
  const qtyReceivedForPrd = (prdNo) =>
    transactions
      .filter((t) => t.prd_no === prdNo && t.transaction_type === 'Production Receipt')
      .reduce((sum, t) => sum + Number(t.qty || 0), 0)

  function handleReset() {
    setDispatchForm(EMPTY_DISPATCH_FORM)
    setReceiptForm(EMPTY_RECEIPT_FORM)
    setError(null)
  }

  async function handleSaveDispatch() {
    const f = dispatchForm
    if (!f.user_emp_id || !f.shift_code || !f.prd_no || !f.qty || !f.transaction_date) {
      setError('User Name, Shift, Production Order Number, Despatch Quantity and Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createFinishedGoodsTransaction({
        product_code: selectedDispatchOrder?.product_code,
        transaction_type: 'Dispatch',
        qty: Number(f.qty),
        transaction_date: f.transaction_date,
        prd_no: f.prd_no,
        customer_id: selectedDispatchOrder?.customer_id ?? null,
        user_emp_id: f.user_emp_id,
        shift_code: f.shift_code,
        user_id: currentUserId,
      })
      handleReset()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveReceipt() {
    const f = receiptForm
    if (!f.user_emp_id || !f.shift_code || !f.prd_no || !f.qty || !f.transaction_date) {
      setError('User Name, Shift, Production Order Number, Quantity Received and Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createFinishedGoodsTransaction({
        product_code: selectedReceiptOrder?.product_code,
        transaction_type: 'Production Receipt',
        qty: Number(f.qty),
        transaction_date: f.transaction_date,
        prd_no: f.prd_no,
        user_emp_id: f.user_emp_id,
        shift_code: f.shift_code,
        user_id: currentUserId,
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
    if (!confirm('Delete this record? This cannot be undone.')) return
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
        user_name: userName(t.user_emp_id),
        order_qty: order?.order_qty ?? '',
        qty_in_stock: qtyInStockForProduct(t.product_code),
        qty_received: qtyReceivedForPrd(t.prd_no),
        balance_to_dispatch: status?.balance_to_dispatch ?? '',
        order_status: status?.order_status ?? '',
      }
    })

  const receiptRows = transactions
    .filter((t) => t.transaction_type === 'Production Receipt')
    .map((t) => ({ ...t, user_name: userName(t.user_emp_id) }))

  const activeRows = mode === 'dispatch' ? dispatchRows : receiptRows
  const filteredRows = activeRows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.transaction_date?.toLowerCase().includes(q) ||
      r.prd_no?.toLowerCase().includes(q) ||
      r.product_code?.toLowerCase().includes(q)
    )
  })

  const activeColumns = [
    ...(mode === 'dispatch' ? DISPATCH_COLUMNS : RECEIPT_COLUMNS),
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

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40'
  const handleSave = mode === 'dispatch' ? handleSaveDispatch : handleSaveReceipt

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        eyebrow="Stores Module"
        title="Finished Goods"
        subtitle="Right Product  |  Right Quantity  |  On Time Delivery"
      />

      <div className="flex items-center gap-1 bg-white border-b border-gray-200 px-6 pt-2">
        {[
          { key: 'dispatch', label: 'Dispatch' },
          { key: 'production-receipt', label: 'Production Receipt' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setMode(t.key)
              setError(null)
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              mode === t.key
                ? 'border-bmlhnavy text-bmlhnavy'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border-b border-gray-200 px-4 py-1.5">
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
          <ClipboardList size={16} /> View History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        {mode === 'dispatch' ? (
          <FormSection icon={PackageCheck} title="Stores Module - Finished Goods Dispatch Details" subtitle="Dispatch to customer" columns={2}>
            <Field label="User ID" required>
              <SelectInput
                value={dispatchForm.user_emp_id}
                onChange={handleDispatchField('user_emp_id')}
                options={users.map((o) => ({ value: o.user_emp_id, label: o.user_emp_id }))}
              />
            </Field>
            <Field label="Order Quantity">
              <AutoFillBox value={selectedDispatchOrder?.order_qty} unit="Nos" />
            </Field>

            <Field label="User Name">
              <AutoFillBox value={userName(dispatchForm.user_emp_id)} />
            </Field>
            <Field label="Quantity in Stock">
              <AutoFillBox value={qtyInStockForProduct(selectedDispatchOrder?.product_code)} unit="Nos" />
            </Field>

            <Field label="Shift" required>
              <SelectInput
                value={dispatchForm.shift_code}
                onChange={handleDispatchField('shift_code')}
                options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name || s.shift_code }))}
              />
            </Field>
            <Field label="Quantity Received">
              <AutoFillBox value={qtyReceivedForPrd(dispatchForm.prd_no)} unit="Nos" />
            </Field>

            <Field label="Date" required>
              <TextInput type="date" value={dispatchForm.transaction_date} onChange={handleDispatchField('transaction_date')} />
            </Field>
            <Field label="Despatch Quantity" required>
              <div className="flex rounded overflow-hidden border border-gray-300">
                <input
                  type="number"
                  value={dispatchForm.qty}
                  onChange={handleDispatchField('qty')}
                  placeholder="Enter Quantity"
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                />
                <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border-l border-gray-300">Nos</span>
              </div>
            </Field>

            <Field label="Production Order number" required>
              <SelectInput
                value={dispatchForm.prd_no}
                onChange={handleDispatchField('prd_no')}
                options={orders.map((o) => o.prd_no)}
              />
            </Field>
            <Field label="Balance Quantity to be despatched">
              <AutoFillBox value={selectedDispatchStatus?.balance_to_dispatch} unit="Nos" />
            </Field>

            <Field label="Product Code">
              <AutoFillBox value={selectedDispatchOrder?.product_code} />
            </Field>
            <Field label="Order Status">
              <div className="flex items-center h-[38px]">
                {selectedDispatchStatus?.order_status ? (
                  <StatusPill status={selectedDispatchStatus.order_status} />
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
            </Field>

            <p className="sm:col-span-2 text-xs text-gray-500 bg-sky-50 border border-sky-100 rounded px-3 py-2">
              "User ID" picks who's physically despatching the goods (User Master); the account you're
              logged in as is recorded automatically.
            </p>
          </FormSection>
        ) : (
          <FormSection icon={PackagePlus} title="Stores Module - Finished Goods Production Receipt Details" subtitle="Receive from production" columns={2}>
            <Field label="User ID" required>
              <SelectInput
                value={receiptForm.user_emp_id}
                onChange={handleReceiptField('user_emp_id')}
                options={users.map((o) => ({ value: o.user_emp_id, label: o.user_emp_id }))}
              />
            </Field>
            <Field label="Product Code">
              <AutoFillBox value={selectedReceiptOrder?.product_code} />
            </Field>

            <Field label="User Name">
              <AutoFillBox value={userName(receiptForm.user_emp_id)} />
            </Field>
            <Field label="Quantity Received" required>
              <div className="flex rounded overflow-hidden border border-gray-300">
                <input
                  type="number"
                  value={receiptForm.qty}
                  onChange={handleReceiptField('qty')}
                  placeholder="Enter Quantity"
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                />
                <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border-l border-gray-300">Nos</span>
              </div>
            </Field>

            <Field label="Shift" required>
              <SelectInput
                value={receiptForm.shift_code}
                onChange={handleReceiptField('shift_code')}
                options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name || s.shift_code }))}
              />
            </Field>
            <Field label="Date" required>
              <TextInput type="date" value={receiptForm.transaction_date} onChange={handleReceiptField('transaction_date')} />
            </Field>

            <Field label="Production Order number" required>
              <SelectInput
                value={receiptForm.prd_no}
                onChange={handleReceiptField('prd_no')}
                options={orders.map((o) => o.prd_no)}
              />
            </Field>
          </FormSection>
        )}

        <RecordsList
          title={mode === 'dispatch' ? 'Finished Goods Dispatch List' : 'Finished Goods Production Receipt List'}
          columns={activeColumns}
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
