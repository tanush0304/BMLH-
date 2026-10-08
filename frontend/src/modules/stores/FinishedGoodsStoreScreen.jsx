import { useEffect, useState } from 'react'
import { PackageCheck, PackagePlus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import StatusPill from '../../components/StatusPill'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { getCurrentUserId } from '../../data/queries/currentUser'
import {
  listFinishedGoodsStockBalance,
  listFinishedGoodsTransactions,
  listFinishedGoodsOrderStatus,
  createFinishedGoodsTransaction,
} from '../../data/queries/finishedGoodsStock'
import { todayISO } from '../../utils/dates'
import { parsePositiveQuantity, validateDispatchQuantity } from '../../utils/finishedGoodsValidation'
import { listFinishedGoodsMaster } from '../../data/queries/storeMasters'
import EmployeeSelect from '../../components/EmployeeSelect'

const EMPTY_DISPATCH_FORM = {
  employee_id: '',
  shift_code: '',
  transaction_date: todayISO(),
  prd_no: '',
  qty: '',
  eway_bill_no: '',
}

const EMPTY_RECEIPT_FORM = {
  employee_id: '',
  shift_code: '',
  transaction_date: todayISO(),
  prd_no: '',
  qty: '',
}

const DISPATCH_COLUMNS = [
  { key: 'transaction_date', label: 'Date' },
  { key: 'employee_id', label: 'Employee ID' },
  { key: 'employee_name', label: 'Employee Name' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'prd_no', label: 'Production Order No.' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'order_qty', label: 'Order Qty (Nos)' },
  { key: 'qty_in_stock', label: 'Qty in Stock (Nos)' },
  { key: 'qty_received', label: 'Qty Received (Nos)' },
  { key: 'qty', label: 'Despatch Qty (Nos)' },
  { key: 'balance_to_dispatch', label: 'Balance Qty (Nos)' },
  { key: 'order_status', label: 'Order Status', type: 'status' },
  { key: 'eway_bill_no', label: 'E-way Bill / ESUGAM No.' },
]

const RECEIPT_COLUMNS = [
  { key: 'transaction_date', label: 'Date' },
  { key: 'employee_id', label: 'Employee ID' },
  { key: 'employee_name', label: 'Employee Name' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'prd_no', label: 'Production Order No.' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'qty', label: 'Qty Received (Nos)' },
]

export default function FinishedGoodsStoreScreen({ initialMode = 'dispatch' }) {
  const [mode, setMode] = useState(initialMode) // 'dispatch' | 'production-receipt'
  const [orders, setOrders] = useState([])
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [finishedGoodsMaster, setFinishedGoodsMaster] = useState([])
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
      const [ords, employeeRows, shf, bal, txns, status, masterRows, userId] = await Promise.all([
        listCustomerOrders(),
        listEmployees(),
        listShifts(),
        listFinishedGoodsStockBalance(),
        listFinishedGoodsTransactions(),
        listFinishedGoodsOrderStatus(),
        listFinishedGoodsMaster(),
        getCurrentUserId(),
      ])
      setOrders(ords)
      setEmployees(employeeRows)
      setShifts(shf)
      setBalances(bal)
      setTransactions(txns)
      setOrderStatus(status)
      setFinishedGoodsMaster(masterRows)
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

  function employeeName(id) {
    return employees.find((o) => o.employee_id === id)?.employee_name ?? ''
  }

  const selectedDispatchOrder = orders.find((o) => o.prd_no === dispatchForm.prd_no)
  const selectedDispatchStatus = orderStatus.find((s) => s.prd_no === dispatchForm.prd_no)
  const selectedReceiptOrder = orders.find((o) => o.prd_no === receiptForm.prd_no)

  const qtyInStockForPrd = (prdNo) =>
    balances.find((b) => b.prd_no === prdNo)?.current_stock ?? 0
  const qtyReceivedForPrd = (prdNo) =>
    finishedGoodsMaster.find((row) => row.prd_no === prdNo)?.receipts ?? 0

  function handleReset() {
    setDispatchForm(EMPTY_DISPATCH_FORM)
    setReceiptForm(EMPTY_RECEIPT_FORM)
    setError(null)
  }

  async function handleSaveDispatch() {
    const f = dispatchForm
    if (!f.employee_id || !f.shift_code || !f.prd_no || !f.qty || !f.transaction_date) {
      setError('Employee Name, Shift, Production Order Number, Despatch Quantity and Date are all required.')
      return
    }
    if (!selectedDispatchOrder?.part_serial_number) {
      setError('The selected Production Order could not be matched to a Part Serial Number.')
      return
    }
    const dispatchValidation = validateDispatchQuantity(
      f.qty,
      qtyInStockForPrd(f.prd_no),
      selectedDispatchStatus?.balance_to_dispatch
    )
    if (dispatchValidation.error) {
      setError(dispatchValidation.error)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createFinishedGoodsTransaction({
        part_serial_number: selectedDispatchOrder?.part_serial_number,
        transaction_type: 'Dispatch',
        qty: dispatchValidation.quantity,
        transaction_date: f.transaction_date,
        prd_no: f.prd_no,
        customer_id: selectedDispatchOrder?.customer_id ?? null,
        employee_id: f.employee_id,
        shift_code: f.shift_code,
        user_id: currentUserId,
        eway_bill_no: f.eway_bill_no || null,
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
    if (!f.employee_id || !f.shift_code || !f.prd_no || !f.qty || !f.transaction_date) {
      setError('Employee Name, Shift, Production Order Number, Quantity Received and Date are all required.')
      return
    }
    const quantity = parsePositiveQuantity(f.qty)
    if (quantity === null) {
      setError('Quantity received must be a finite number greater than zero.')
      return
    }
    if (!selectedReceiptOrder?.part_serial_number) {
      setError('The selected Production Order could not be matched to a Part Serial Number.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createFinishedGoodsTransaction({
        part_serial_number: selectedReceiptOrder?.part_serial_number,
        transaction_type: 'Production Receipt',
        qty: quantity,
        transaction_date: f.transaction_date,
        prd_no: f.prd_no,
        employee_id: f.employee_id,
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

  const dispatchRows = transactions
    .filter((t) => t.transaction_type === 'Dispatch')
    .map((t) => {
      const order = orders.find((o) => o.prd_no === t.prd_no)
      const status = orderStatus.find((s) => s.prd_no === t.prd_no)
      return {
        ...t,
        employee_name: employeeName(t.employee_id),
        order_qty: order?.order_qty ?? '',
        qty_in_stock: qtyInStockForPrd(t.prd_no),
        qty_received: qtyReceivedForPrd(t.prd_no),
        balance_to_dispatch: status?.balance_to_dispatch ?? '',
        order_status: status?.order_status ?? '',
      }
    })

  const receiptRows = transactions
    .filter((t) => t.transaction_type === 'Production Receipt')
    .map((t) => ({ ...t, employee_name: employeeName(t.employee_id) }))

  const activeRows = mode === 'dispatch' ? dispatchRows : receiptRows
  const filteredRows = activeRows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.transaction_date?.toLowerCase().includes(q) ||
      r.prd_no?.toLowerCase().includes(q) ||
      r.part_serial_number?.toLowerCase().includes(q)
    )
  })

  const activeColumns = mode === 'dispatch' ? DISPATCH_COLUMNS : RECEIPT_COLUMNS
  const listTitle = mode === 'dispatch' ? 'Finished Goods Dispatch List' : 'Finished Goods Production Receipt List'
  const exportName = mode === 'dispatch' ? 'fg_dispatch' : 'fg_production_receipt'

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

      {/* Stock ledger: no Edit / Delete -- corrections are a new entry with remarks. */}
      <ActionToolbar
        showEditDelete={false}
        onNew={handleReset}
        onSave={handleSave}
        onClear={handleReset}
        saving={saving}
        onExportExcel={() => exportToCsv(activeColumns, filteredRows, `${exportName}.csv`)}
        onExportPdf={() => exportToPdf(activeColumns, filteredRows, listTitle, exportName)}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        {mode === 'dispatch' ? (
          <FormSection icon={PackageCheck} title="Stores Module - Finished Goods Dispatch Details" subtitle="Dispatch to customer" columns={2}>
            <Field label="Employee ID" required>
              <EmployeeSelect employees={employees} value={dispatchForm.employee_id} onChange={handleDispatchField('employee_id')} />
            </Field>
            <Field label="Order Quantity">
              <AutoFillBox value={selectedDispatchOrder?.order_qty} unit="Nos" />
            </Field>

            <Field label="Employee Name">
              <AutoFillBox value={employeeName(dispatchForm.employee_id)} />
            </Field>
            <Field label="Quantity in Stock">
              <AutoFillBox value={qtyInStockForPrd(dispatchForm.prd_no)} unit="Nos" />
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
                  min="0"
                  step="any"
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

            <Field label="Part Serial Number">
              <AutoFillBox value={selectedDispatchOrder?.part_serial_number} />
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

            <Field label="E-way Bill / ESUGAM No.">
              <TextInput value={dispatchForm.eway_bill_no} onChange={handleDispatchField('eway_bill_no')} />
            </Field>

            <p className="sm:col-span-2 text-xs text-gray-500 bg-sky-50 border border-sky-100 rounded px-3 py-2">
              "Employee ID" picks who's physically despatching the goods (Employee Master); the account you're
              logged in as is recorded automatically.
            </p>
          </FormSection>
        ) : (
          <FormSection icon={PackagePlus} title="Stores Module - Finished Goods Production Receipt Details" subtitle="Receive from production" columns={2}>
            <Field label="Employee ID" required>
              <EmployeeSelect employees={employees} value={receiptForm.employee_id} onChange={handleReceiptField('employee_id')} />
            </Field>
            <Field label="Part Serial Number">
              <AutoFillBox value={selectedReceiptOrder?.part_serial_number} />
            </Field>

            <Field label="Employee Name">
              <AutoFillBox value={employeeName(receiptForm.employee_id)} />
            </Field>
            <Field label="Quantity Received" required>
              <div className="flex rounded overflow-hidden border border-gray-300">
                <input
                  type="number"
                  min="0"
                  step="any"
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
          title={listTitle}
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
