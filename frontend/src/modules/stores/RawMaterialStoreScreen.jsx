import { useEffect, useState } from 'react'
import { Boxes, RotateCcw, X, ClipboardList, Trash2, Plus, Save, PackagePlus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listRawMaterials } from '../../data/queries/rawMaterials'
import { listProducts } from '../../data/queries/products'
import { listOperators } from '../../data/queries/operators'
import { listShifts } from '../../data/queries/shifts'
import { listSuppliers } from '../../data/queries/suppliers'
import { getCurrentUserId } from '../../data/queries/currentUser'
import {
  listRawMaterialStockBalance,
  listRawMaterialTransactions,
  createRawMaterialTransaction,
  deleteRawMaterialTransaction,
} from '../../data/queries/rawMaterialStock'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const EMPTY_ISSUE_FORM = {
  operator_emp_id: '',
  shift_code: '',
  raw_material_code: '',
  product_code: '',
  qty: '',
  transaction_date: todayISO(),
}

const EMPTY_RECEIPT_FORM = {
  operator_emp_id: '',
  shift_code: '',
  raw_material_code: '',
  supplier_id: '',
  qty: '',
  transaction_date: todayISO(),
}

const ISSUE_COLUMNS = [
  { key: 'transaction_date', label: 'Issue Date' },
  { key: 'operator_emp_id', label: 'User ID' },
  { key: 'user_name', label: 'User Name' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'material_name', label: 'RM / Consumable Name' },
  { key: 'product_code', label: 'Product Code' },
  { key: 'current_stock', label: 'Current Stock (Nos)' },
  { key: 'qty', label: 'Qty Issued (Nos)' },
  { key: 'units_producible', label: 'No. of Units Can be Produced' },
]

const RECEIPT_COLUMNS = [
  { key: 'transaction_date', label: 'Receipt Date' },
  { key: 'operator_emp_id', label: 'User ID' },
  { key: 'user_name', label: 'User Name' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'material_name', label: 'RM / Consumable Name' },
  { key: 'supplier_id', label: 'Supplier' },
  { key: 'qty', label: 'Qty Received (Nos)' },
  { key: 'current_stock', label: 'Current Stock (Nos)' },
]

export default function RawMaterialStoreScreen() {
  const [mode, setMode] = useState('issue') // 'issue' | 'receipt'
  const [rawMaterials, setRawMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [operators, setOperators] = useState([])
  const [shifts, setShifts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [issueForm, setIssueForm] = useState(EMPTY_ISSUE_FORM)
  const [receiptForm, setReceiptForm] = useState(EMPTY_RECEIPT_FORM)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [rms, prods, ops, shf, sups, bal, txns, userId] = await Promise.all([
        listRawMaterials(),
        listProducts(),
        listOperators(),
        listShifts(),
        listSuppliers(),
        listRawMaterialStockBalance(),
        listRawMaterialTransactions(),
        getCurrentUserId(),
      ])
      setRawMaterials(rms)
      setProducts(prods)
      setOperators(ops)
      setShifts(shf)
      setSuppliers(sups)
      setBalances(bal)
      setTransactions(txns)
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

  function operatorName(id) {
    return operators.find((o) => o.operator_emp_id === id)?.operator_name ?? ''
  }

  function materialName(code) {
    return rawMaterials.find((r) => r.raw_material_code === code)?.raw_material_name ?? code
  }

  function currentStockFor(code) {
    return balances.find((b) => b.raw_material_code === code)?.current_stock ?? ''
  }

  function handleReset() {
    setIssueForm(EMPTY_ISSUE_FORM)
    setReceiptForm(EMPTY_RECEIPT_FORM)
    setError(null)
  }

  function handleIssueField(key) {
    return (e) => setIssueForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleReceiptField(key) {
    return (e) => setReceiptForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSaveIssue() {
    const f = issueForm
    if (!f.operator_emp_id || !f.shift_code || !f.raw_material_code || !f.qty || !f.transaction_date) {
      setError('User Name, Shift, Raw Material / Consumable, Quantity Issued and Issue Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createRawMaterialTransaction({
        raw_material_code: f.raw_material_code,
        transaction_type: 'Issue',
        qty: Number(f.qty),
        transaction_date: f.transaction_date,
        product_code: f.product_code || null,
        operator_emp_id: f.operator_emp_id,
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
    if (!f.operator_emp_id || !f.shift_code || !f.raw_material_code || !f.qty || !f.transaction_date) {
      setError('User Name, Shift, Raw Material / Consumable, Quantity Received and Receipt Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createRawMaterialTransaction({
        raw_material_code: f.raw_material_code,
        transaction_type: 'Receipt',
        qty: Number(f.qty),
        transaction_date: f.transaction_date,
        supplier_id: f.supplier_id || null,
        operator_emp_id: f.operator_emp_id,
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
      await deleteRawMaterialTransaction(id)
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const issueRows = transactions
    .filter((t) => t.transaction_type === 'Issue')
    .map((t) => ({
      ...t,
      user_name: operatorName(t.operator_emp_id),
      material_name: materialName(t.raw_material_code),
      current_stock: currentStockFor(t.raw_material_code),
      units_producible: '—',
    }))

  const receiptRows = transactions
    .filter((t) => t.transaction_type === 'Receipt')
    .map((t) => ({
      ...t,
      user_name: operatorName(t.operator_emp_id),
      material_name: materialName(t.raw_material_code),
      current_stock: currentStockFor(t.raw_material_code),
    }))

  const activeRows = mode === 'issue' ? issueRows : receiptRows
  const filteredRows = activeRows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.transaction_date?.toLowerCase().includes(q) ||
      r.operator_emp_id?.toLowerCase().includes(q) ||
      r.material_name?.toLowerCase().includes(q)
    )
  })

  const activeColumns = [
    ...(mode === 'issue' ? ISSUE_COLUMNS : RECEIPT_COLUMNS),
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
  const handleSave = mode === 'issue' ? handleSaveIssue : handleSaveReceipt

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        eyebrow="Stores Module"
        title="Raw Material & Consumables"
        subtitle="Right Material  |  Right Quantity  |  Right Production"
      />

      <div className="flex items-center gap-1 bg-white border-b border-gray-200 px-6 pt-2">
        {[
          { key: 'issue', label: 'Issue' },
          { key: 'receipt', label: 'Receipt' },
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

        {mode === 'issue' ? (
          <FormSection icon={Boxes} title="Stores Module - Raw Material & Consumables Issue Details" columns={2}>
            <Field label="User ID" required>
              <SelectInput
                value={issueForm.operator_emp_id}
                onChange={handleIssueField('operator_emp_id')}
                options={operators.map((o) => ({ value: o.operator_emp_id, label: o.operator_emp_id }))}
              />
            </Field>
            <Field label="Current Stock">
              <AutoFillBox value={currentStockFor(issueForm.raw_material_code)} unit="Nos" />
            </Field>

            <Field label="User Name">
              <AutoFillBox value={operatorName(issueForm.operator_emp_id)} />
            </Field>
            <Field label="Number of units can be produced">
              <AutoFillBox value="" unit="Nos" />
            </Field>

            <Field label="Shift" required>
              <SelectInput
                value={issueForm.shift_code}
                onChange={handleIssueField('shift_code')}
                options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name || s.shift_code }))}
              />
            </Field>
            <Field label="Quantity Issued" required>
              <div className="flex rounded overflow-hidden border border-gray-300">
                <input
                  type="number"
                  value={issueForm.qty}
                  onChange={handleIssueField('qty')}
                  placeholder="Enter Quantity"
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                />
                <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border-l border-gray-300">Nos</span>
              </div>
            </Field>

            <Field label="Raw material / Consumable name" required>
              <SelectInput
                value={issueForm.raw_material_code}
                onChange={handleIssueField('raw_material_code')}
                options={rawMaterials.map((r) => ({
                  value: r.raw_material_code,
                  label: r.raw_material_name || r.raw_material_code,
                }))}
              />
            </Field>
            <Field label="Issue Date" required>
              <TextInput type="date" value={issueForm.transaction_date} onChange={handleIssueField('transaction_date')} />
            </Field>

            <Field label="Product Code">
              <SelectInput
                value={issueForm.product_code}
                onChange={handleIssueField('product_code')}
                options={products.map((p) => ({ value: p.product_code, label: p.product_code }))}
              />
            </Field>

            <p className="sm:col-span-2 text-xs text-gray-500 bg-sky-50 border border-sky-100 rounded px-3 py-2">
              "User ID" picks who's physically issuing the material (Operator Master); the account you're
              logged in as is recorded automatically. Current Stock auto-fills from the selected material.
              Number of units can be produced needs a Bill of Materials, which isn't set up yet, so it stays
              blank for now.
            </p>
          </FormSection>
        ) : (
          <FormSection icon={PackagePlus} title="Stores Module - Raw Material & Consumables Receipt Details" columns={2}>
            <Field label="User ID" required>
              <SelectInput
                value={receiptForm.operator_emp_id}
                onChange={handleReceiptField('operator_emp_id')}
                options={operators.map((o) => ({ value: o.operator_emp_id, label: o.operator_emp_id }))}
              />
            </Field>
            <Field label="Current Stock">
              <AutoFillBox value={currentStockFor(receiptForm.raw_material_code)} unit="Nos" />
            </Field>

            <Field label="User Name">
              <AutoFillBox value={operatorName(receiptForm.operator_emp_id)} />
            </Field>
            <Field label="Supplier">
              <SelectInput
                value={receiptForm.supplier_id}
                onChange={handleReceiptField('supplier_id')}
                options={suppliers.map((s) => ({ value: s.supplier_id, label: s.supplier_name || s.supplier_id }))}
              />
            </Field>

            <Field label="Shift" required>
              <SelectInput
                value={receiptForm.shift_code}
                onChange={handleReceiptField('shift_code')}
                options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name || s.shift_code }))}
              />
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

            <Field label="Raw material / Consumable name" required>
              <SelectInput
                value={receiptForm.raw_material_code}
                onChange={handleReceiptField('raw_material_code')}
                options={rawMaterials.map((r) => ({
                  value: r.raw_material_code,
                  label: r.raw_material_name || r.raw_material_code,
                }))}
              />
            </Field>
            <Field label="Receipt Date" required>
              <TextInput type="date" value={receiptForm.transaction_date} onChange={handleReceiptField('transaction_date')} />
            </Field>
          </FormSection>
        )}

        <RecordsList
          title={mode === 'issue' ? 'Raw Material & Consumables Issue List' : 'Raw Material & Consumables Receipt List'}
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
