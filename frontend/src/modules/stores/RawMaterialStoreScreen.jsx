import { useEffect, useState } from 'react'
import { Boxes, RotateCcw, X, ClipboardList, Trash2, Plus, Save } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listRawMaterials } from '../../data/queries/rawMaterials'
import { listProducts } from '../../data/queries/products'
import { listOperators } from '../../data/queries/operators'
import { listShifts } from '../../data/queries/shifts'
import {
  listRawMaterialStockBalance,
  listRawMaterialTransactions,
  createRawMaterialTransaction,
  deleteRawMaterialTransaction,
} from '../../data/queries/rawMaterialStock'

const TXN_COLUMNS = [
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

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const EMPTY_FORM = {
  operator_emp_id: '',
  shift_code: '',
  raw_material_code: '',
  product_code: '',
  qty: '',
  transaction_date: todayISO(),
}

export default function RawMaterialStoreScreen() {
  const [rawMaterials, setRawMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [operators, setOperators] = useState([])
  const [shifts, setShifts] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [rms, prods, ops, shf, bal, txns] = await Promise.all([
        listRawMaterials(),
        listProducts(),
        listOperators(),
        listShifts(),
        listRawMaterialStockBalance(),
        listRawMaterialTransactions(),
      ])
      setRawMaterials(rms)
      setProducts(prods)
      setOperators(ops)
      setShifts(shf)
      setBalances(bal)
      setTransactions(txns)
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

  function materialName(code) {
    return rawMaterials.find((r) => r.raw_material_code === code)?.raw_material_name ?? code
  }

  function currentStockFor(code) {
    return balances.find((b) => b.raw_material_code === code)?.current_stock ?? ''
  }

  function handleReset() {
    setForm(EMPTY_FORM)
    setError(null)
  }

  async function handleSave() {
    if (!form.operator_emp_id || !form.shift_code || !form.raw_material_code || !form.qty || !form.transaction_date) {
      setError('User ID, Shift, Raw Material / Consumable, Quantity Issued and Issue Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createRawMaterialTransaction({
        raw_material_code: form.raw_material_code,
        transaction_type: 'Issue',
        qty: Number(form.qty),
        transaction_date: form.transaction_date,
        product_code: form.product_code || null,
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
    if (!confirm('Delete this issue record? This cannot be undone.')) return
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

  const filteredRows = issueRows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.transaction_date?.toLowerCase().includes(q) ||
      r.operator_emp_id?.toLowerCase().includes(q) ||
      r.product_code?.toLowerCase().includes(q) ||
      r.material_name?.toLowerCase().includes(q)
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
        title="Raw Material & Consumables Issue"
        subtitle="Right Material  |  Right Quantity  |  Right Production"
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

        <FormSection icon={Boxes} title="Stores Module - Raw Material & Consumables Issue Details" columns={2}>
          <Field label="User ID" required>
            <SelectInput
              value={form.operator_emp_id}
              onChange={handleField('operator_emp_id')}
              options={operators.map((o) => ({ value: o.operator_emp_id, label: o.operator_emp_id }))}
            />
          </Field>
          <Field label="Current Stock">
            <AutoFillBox value={currentStockFor(form.raw_material_code)} unit="Nos" />
          </Field>

          <Field label="User Name">
            <AutoFillBox value={operatorName(form.operator_emp_id)} />
          </Field>
          <Field label="Number of units can be produced">
            <AutoFillBox value="" unit="Nos" />
          </Field>

          <Field label="Shift" required>
            <SelectInput
              value={form.shift_code}
              onChange={handleField('shift_code')}
              options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name || s.shift_code }))}
            />
          </Field>
          <Field label="Quantity Issued" required>
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

          <Field label="Raw material / Consumable name" required>
            <SelectInput
              value={form.raw_material_code}
              onChange={handleField('raw_material_code')}
              options={rawMaterials.map((r) => ({
                value: r.raw_material_code,
                label: r.raw_material_name || r.raw_material_code,
              }))}
            />
          </Field>
          <Field label="Issue Date" required>
            <TextInput type="date" value={form.transaction_date} onChange={handleField('transaction_date')} />
          </Field>

          <Field label="Product Code">
            <SelectInput
              value={form.product_code}
              onChange={handleField('product_code')}
              options={products.map((p) => ({ value: p.product_code, label: p.product_code }))}
            />
          </Field>

          <p className="sm:col-span-2 text-xs text-gray-500 bg-sky-50 border border-sky-100 rounded px-3 py-2">
            Current Stock will be auto-filled based on the selected Raw Material / Consumable. Number of
            units can be produced needs a Bill of Materials, which isn't set up yet, so it stays blank for now.
          </p>
        </FormSection>

        <RecordsList
          title="Raw Material & Consumables Issue List"
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
