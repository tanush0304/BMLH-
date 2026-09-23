import { useEffect, useState } from 'react'
import { Boxes } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listRawMaterials } from '../../data/queries/rawMaterials'
import { listSuppliers } from '../../data/queries/suppliers'
import {
  listRawMaterialStockBalance,
  listRawMaterialTransactions,
  createRawMaterialTransaction,
} from '../../data/queries/rawMaterialStock'

const BALANCE_COLUMNS = [
  { key: 'raw_material_code', label: 'RM Code' },
  { key: 'current_stock', label: 'Current Stock' },
]

const TXN_COLUMNS = [
  { key: 'raw_material_code', label: 'RM Code' },
  { key: 'transaction_type', label: 'Type' },
  { key: 'qty', label: 'Qty' },
  { key: 'transaction_date', label: 'Date' },
  { key: 'supplier_id', label: 'Supplier' },
  { key: 'production_order_no', label: 'PRD No' },
]

const EMPTY_FORM = {
  raw_material_code: '',
  transaction_type: 'Receipt',
  qty: '',
  transaction_date: '',
  supplier_id: '',
  production_order_no: '',
  remarks: '',
}

export default function RawMaterialStoreScreen() {
  const [rawMaterials, setRawMaterials] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [rms, sups, bal, txns] = await Promise.all([
        listRawMaterials(),
        listSuppliers(),
        listRawMaterialStockBalance(),
        listRawMaterialTransactions(),
      ])
      setRawMaterials(rms)
      setSuppliers(sups)
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

  async function handleSave() {
    if (!form.raw_material_code || !form.qty || !form.transaction_date) {
      setError('Raw Material, Qty and Date are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createRawMaterialTransaction({
        raw_material_code: form.raw_material_code,
        transaction_type: form.transaction_type,
        qty: Number(form.qty),
        transaction_date: form.transaction_date,
        supplier_id: form.transaction_type === 'Receipt' ? form.supplier_id || null : null,
        production_order_no: form.transaction_type === 'Issue' ? form.production_order_no || null : null,
        remarks: form.remarks || null,
      })
      setForm(EMPTY_FORM)
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Raw Material Stores" subtitle="Receipts & Issues  |  Live Stock Balance" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={Boxes} title="1. New Transaction" columns={3}>
          <Field label="Raw Material" required>
            <SelectInput
              value={form.raw_material_code}
              onChange={handleField('raw_material_code')}
              options={rawMaterials.map((r) => r.raw_material_code)}
            />
          </Field>
          <Field label="Transaction Type" required>
            <SelectInput value={form.transaction_type} onChange={handleField('transaction_type')} options={['Receipt', 'Issue']} />
          </Field>
          <Field label="Qty" required>
            <TextInput type="number" value={form.qty} onChange={handleField('qty')} />
          </Field>
          <Field label="Date" required>
            <TextInput type="date" value={form.transaction_date} onChange={handleField('transaction_date')} />
          </Field>
          {form.transaction_type === 'Receipt' && (
            <Field label="Supplier">
              <SelectInput value={form.supplier_id} onChange={handleField('supplier_id')} options={suppliers.map((s) => s.supplier_id)} />
            </Field>
          )}
          {form.transaction_type === 'Issue' && (
            <Field label="Production Order No">
              <TextInput value={form.production_order_no} onChange={handleField('production_order_no')} />
            </Field>
          )}
          <Field label="Remarks">
            <TextInput value={form.remarks} onChange={handleField('remarks')} />
          </Field>
          <div className="flex items-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-green-700"
            >
              {saving ? 'Saving...' : 'Record Transaction'}
            </button>
          </div>
        </FormSection>

        <RecordsList title="Raw Material Stock Balance" columns={BALANCE_COLUMNS} rows={balances} loading={loading} rowKey="raw_material_code" />
        <RecordsList title="Recent Transactions" columns={TXN_COLUMNS} rows={transactions} loading={loading} rowKey="id" />
      </div>
    </div>
  )
}
