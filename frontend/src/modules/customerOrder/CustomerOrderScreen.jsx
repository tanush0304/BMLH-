import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listCustomerOrders,
  createCustomerOrder,
  updateCustomerOrder,
  deleteCustomerOrder,
} from '../../data/queries/customerOrders'
import { listCustomerEnquiries } from '../../data/queries/customerEnquiries'
import { listCustomers } from '../../data/queries/customers'
import { listProducts } from '../../data/queries/products'

const EMPTY_FORM = {
  prd_no: '',
  qtn_no: '',
  customer_id: '',
  po_number: '',
  po_date: '',
  product_code: '',
  order_qty: '',
  expected_delivery: '',
}

const LIST_COLUMNS = [
  { key: 'prd_no', label: 'PRD No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'po_number', label: 'PO Number' },
  { key: 'product_code', label: 'Product' },
  { key: 'order_qty', label: 'Order Qty' },
  { key: 'expected_delivery', label: 'Expected Delivery' },
]

export default function CustomerOrderScreen() {
  const [records, setRecords] = useState([])
  const [enquiries, setEnquiries] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [orders, enq, custs, prods] = await Promise.all([
        listCustomerOrders(),
        listCustomerEnquiries(),
        listCustomers(),
        listProducts(),
      ])
      setRecords(orders)
      setEnquiries(enq)
      setCustomers(custs)
      setProducts(prods)
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

  function handleNew() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
  }

  function handleRowClick(row) {
    setForm({ ...EMPTY_FORM, ...row })
    setMode('view')
    setSaveError(null)
  }

  function handleEdit() {
    if (!form.prd_no) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.prd_no || !form.customer_id || !form.po_number || !form.po_date || !form.product_code || !form.order_qty) {
      setSaveError('PRD No, Customer, PO Number, PO Date, Product and Order Qty are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        qtn_no: form.qtn_no || null,
        customer_id: form.customer_id,
        po_number: form.po_number,
        po_date: form.po_date,
        product_code: form.product_code,
        order_qty: Number(form.order_qty),
        expected_delivery: form.expected_delivery || null,
      }
      if (mode === 'edit') {
        await updateCustomerOrder(form.prd_no, payload)
      } else {
        await createCustomerOrder({ prd_no: form.prd_no, ...payload })
      }
      await refresh()
      setMode('view')
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!form.prd_no) return
    if (!confirm(`Delete order ${form.prd_no}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteCustomerOrder(form.prd_no)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    const header = LIST_COLUMNS.map((c) => c.label).join(',')
    const rows = filteredRecords.map((r) => LIST_COLUMNS.map((c) => r[c.key] ?? '').join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customer_orders.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return r.prd_no?.toLowerCase().includes(q) || r.po_number?.toLowerCase().includes(q)
  })

  const readOnly = mode === 'view'
  const idLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Customer Orders" subtitle="Purchase Order Stage  |  One Row Per PRD" />
      <ActionToolbar
        onNew={handleNew}
        onSave={handleSave}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClear={handleClear}
        canSave={!readOnly && !saving}
        canEdit={mode === 'view'}
        canDelete={mode !== 'new' && !saving}
        searchValue={toolbarSearch}
        onSearchChange={setToolbarSearch}
        onSearch={handleToolbarSearch}
        searchPlaceholder="Search by PRD No / PO Number..."
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <FormSection icon={ClipboardList} title="1. Order Details" columns={3}>
          <Field label="PRD No" required>
            <TextInput value={form.prd_no} onChange={handleField('prd_no')} disabled={idLocked} />
          </Field>
          <Field label="Linked Enquiry (QTN No)">
            <SelectInput
              value={form.qtn_no}
              onChange={handleField('qtn_no')}
              disabled={readOnly}
              options={enquiries.map((e) => e.qtn_no)}
            />
          </Field>
          <Field label="Customer" required>
            <SelectInput
              value={form.customer_id}
              onChange={handleField('customer_id')}
              disabled={readOnly}
              options={customers.map((c) => c.customer_id)}
            />
          </Field>
          <Field label="PO Number" required>
            <TextInput value={form.po_number} onChange={handleField('po_number')} disabled={readOnly} />
          </Field>
          <Field label="PO Date" required>
            <TextInput type="date" value={form.po_date} onChange={handleField('po_date')} disabled={readOnly} />
          </Field>
          <Field label="Product" required>
            <SelectInput
              value={form.product_code}
              onChange={handleField('product_code')}
              disabled={readOnly}
              options={products.map((p) => p.product_code)}
            />
          </Field>
          <Field label="Order Qty" required>
            <TextInput type="number" value={form.order_qty} onChange={handleField('order_qty')} disabled={readOnly} />
          </Field>
          <Field label="Expected Delivery">
            <TextInput
              type="date"
              value={form.expected_delivery}
              onChange={handleField('expected_delivery')}
              disabled={readOnly}
            />
          </Field>
        </FormSection>

        <RecordsList
          title="Customer Orders List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="prd_no"
          selectedKey={form.prd_no}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
