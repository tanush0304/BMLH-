import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listCustomerEnquiries,
  createCustomerEnquiry,
  updateCustomerEnquiry,
  deleteCustomerEnquiry,
} from '../../data/queries/customerEnquiries'
import { listCustomers } from '../../data/queries/customers'
import { listProducts } from '../../data/queries/products'

const EMPTY_FORM = {
  qtn_no: '',
  customer_id: '',
  drawing_number: '',
  product_code: '',
  quoted_price: '',
  quoted_date: '',
  supply_lead_time_days: '',
  revision_status: '',
}

const LIST_COLUMNS = [
  { key: 'qtn_no', label: 'QTN No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'product_code', label: 'Product' },
  { key: 'quoted_price', label: 'Quoted Price' },
  { key: 'quoted_date', label: 'Quoted Date' },
  { key: 'revision_status', label: 'Revision Status' },
]

export default function CustomerEnquiryScreen() {
  const [records, setRecords] = useState([])
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
      const [enquiries, custs, prods] = await Promise.all([
        listCustomerEnquiries(),
        listCustomers(),
        listProducts(),
      ])
      setRecords(enquiries)
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
    if (!form.qtn_no) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.qtn_no || !form.customer_id) {
      setSaveError('QTN No and Customer are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        customer_id: form.customer_id,
        drawing_number: form.drawing_number || null,
        product_code: form.product_code || null,
        quoted_price: form.quoted_price === '' ? null : Number(form.quoted_price),
        quoted_date: form.quoted_date || undefined,
        supply_lead_time_days: form.supply_lead_time_days === '' ? null : Number(form.supply_lead_time_days),
        revision_status: form.revision_status || null,
      }
      if (mode === 'edit') {
        await updateCustomerEnquiry(form.qtn_no, payload)
      } else {
        await createCustomerEnquiry({ qtn_no: form.qtn_no, ...payload })
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
    if (!form.qtn_no) return
    if (!confirm(`Delete enquiry ${form.qtn_no}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteCustomerEnquiry(form.qtn_no)
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
    a.download = 'customer_enquiries.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return r.qtn_no?.toLowerCase().includes(q) || r.customer_id?.toLowerCase().includes(q)
  })

  const readOnly = mode === 'view'
  const idLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Customer Enquiries" subtitle="Quotation Stage  |  Enquiry to Quote" />
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
        searchPlaceholder="Search by QTN No / Customer..."
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <FormSection icon={FileText} title="1. Enquiry Details" columns={3}>
          <Field label="QTN No" required>
            <TextInput value={form.qtn_no} onChange={handleField('qtn_no')} disabled={idLocked} />
          </Field>
          <Field label="Customer" required>
            <SelectInput
              value={form.customer_id}
              onChange={handleField('customer_id')}
              disabled={readOnly}
              options={customers.map((c) => c.customer_id)}
            />
          </Field>
          <Field label="Product">
            <SelectInput
              value={form.product_code}
              onChange={handleField('product_code')}
              disabled={readOnly}
              options={products.map((p) => p.product_code)}
            />
          </Field>
          <Field label="Drawing Number">
            <TextInput value={form.drawing_number} onChange={handleField('drawing_number')} disabled={readOnly} />
          </Field>
          <Field label="Quoted Price">
            <TextInput
              type="number"
              value={form.quoted_price}
              onChange={handleField('quoted_price')}
              disabled={readOnly}
            />
          </Field>
          <Field label="Quoted Date">
            <TextInput type="date" value={form.quoted_date} onChange={handleField('quoted_date')} disabled={readOnly} />
          </Field>
          <Field label="Supply Lead Time (Days)">
            <TextInput
              type="number"
              value={form.supply_lead_time_days}
              onChange={handleField('supply_lead_time_days')}
              disabled={readOnly}
            />
          </Field>
          <Field label="Revision Status">
            <TextInput value={form.revision_status} onChange={handleField('revision_status')} disabled={readOnly} />
          </Field>
        </FormSection>

        <RecordsList
          title="Customer Enquiries List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="qtn_no"
          selectedKey={form.qtn_no}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
