import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listProducts } from '../../data/queries/products'
import { listCustomers } from '../../data/queries/customers'
import {
  listFinishedGoodsStockBalance,
  listFinishedGoodsTransactions,
  createFinishedGoodsTransaction,
} from '../../data/queries/finishedGoodsStock'

const BALANCE_COLUMNS = [
  { key: 'product_code', label: 'Product Code' },
  { key: 'current_stock', label: 'Current Stock' },
]

const TXN_COLUMNS = [
  { key: 'product_code', label: 'Product Code' },
  { key: 'transaction_type', label: 'Type' },
  { key: 'qty', label: 'Qty' },
  { key: 'transaction_date', label: 'Date' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'production_order_no', label: 'PRD No' },
]

const EMPTY_FORM = {
  product_code: '',
  transaction_type: 'Production Receipt',
  qty: '',
  transaction_date: '',
  customer_id: '',
  production_order_no: '',
  remarks: '',
}

export default function FinishedGoodsStoreScreen() {
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
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
      const [prods, custs, bal, txns] = await Promise.all([
        listProducts(),
        listCustomers(),
        listFinishedGoodsStockBalance(),
        listFinishedGoodsTransactions(),
      ])
      setProducts(prods)
      setCustomers(custs)
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
    if (!form.product_code || !form.qty || !form.transaction_date) {
      setError('Product, Qty and Date are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createFinishedGoodsTransaction({
        product_code: form.product_code,
        transaction_type: form.transaction_type,
        qty: Number(form.qty),
        transaction_date: form.transaction_date,
        customer_id: form.transaction_type === 'Dispatch' ? form.customer_id || null : null,
        production_order_no:
          form.transaction_type === 'Production Receipt' ? form.production_order_no || null : null,
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
      <PageHeader title="Finished Goods Stores" subtitle="Production Receipts & Dispatches  |  Live Stock Balance" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={PackageCheck} title="1. New Transaction" columns={3}>
          <Field label="Product" required>
            <SelectInput value={form.product_code} onChange={handleField('product_code')} options={products.map((p) => p.product_code)} />
          </Field>
          <Field label="Transaction Type" required>
            <SelectInput
              value={form.transaction_type}
              onChange={handleField('transaction_type')}
              options={['Production Receipt', 'Dispatch']}
            />
          </Field>
          <Field label="Qty" required>
            <TextInput type="number" value={form.qty} onChange={handleField('qty')} />
          </Field>
          <Field label="Date" required>
            <TextInput type="date" value={form.transaction_date} onChange={handleField('transaction_date')} />
          </Field>
          {form.transaction_type === 'Dispatch' && (
            <Field label="Customer">
              <SelectInput value={form.customer_id} onChange={handleField('customer_id')} options={customers.map((c) => c.customer_id)} />
            </Field>
          )}
          {form.transaction_type === 'Production Receipt' && (
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

        <RecordsList title="Finished Goods Stock Balance" columns={BALANCE_COLUMNS} rows={balances} loading={loading} rowKey="product_code" />
        <RecordsList title="Recent Transactions" columns={TXN_COLUMNS} rows={transactions} loading={loading} rowKey="id" />
      </div>
    </div>
  )
}
