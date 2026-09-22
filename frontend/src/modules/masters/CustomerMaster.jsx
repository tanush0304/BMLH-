import { useEffect, useState } from 'react'
import { User, Phone, Home, MapPin, FileText, Landmark, Settings } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../../data/queries/customers'

const EMPTY_FORM = {
  customer_id: '',
  customer_name: '',
  contact_person_name: '',
  mobile_number: '',
  email_address: '',
  alternate_contact_number: '',
  registered_address: '',
  registered_city: '',
  registered_state: '',
  registered_pincode: '',
  registered_country: '',
  delivery_address: '',
  delivery_city: '',
  delivery_state: '',
  delivery_pincode: '',
  delivery_country: '',
  gstin_number: '',
  pan_number: '',
  msme_udyam_no: '',
  gst_registered: '',
  payment_terms: '',
  currency: '',
  customer_product_part_number: '',
  customer_product_part_name: '',
  customer_drawing_ref_no: '',
  revision_drawing_no: '',
  status: '',
}

const COLUMNS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'contact_person_name', label: 'Contact Person' },
  { key: 'mobile_number', label: 'Mobile Number' },
  { key: 'email_address', label: 'Email Address' },
  { key: 'registered_city', label: 'City' },
  { key: 'registered_state', label: 'State' },
  { key: 'status', label: 'Status', type: 'status' },
]

export default function CustomerMaster() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('new') // 'new' | 'edit' | 'view'
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setRecords(await listCustomers())
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
    if (!form.customer_id) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.customer_id || !form.customer_name) {
      setSaveError('Customer ID and Customer Name are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { ...form, gst_registered: form.gst_registered === 'true' }
      if (mode === 'edit') {
        await updateCustomer(form.customer_id, payload)
      } else {
        await createCustomer(payload)
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
    if (!form.customer_id) return
    if (!confirm(`Delete customer ${form.customer_id}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteCustomer(form.customer_id)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    const header = COLUMNS.map((c) => c.label).join(',')
    const rows = filteredRecords.map((r) => COLUMNS.map((c) => r[c.key] ?? '').join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customer_master.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return (
      r.customer_id?.toLowerCase().includes(q) || r.customer_name?.toLowerCase().includes(q)
    )
  })

  const readOnly = mode === 'view'
  const idLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        title="Customer Master"
        subtitle="Manage Customer Information  |  Build Stronger Relationships"
      />
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
        searchPlaceholder="Search by Customer ID / Name..."
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <FormSection icon={User} title="1. Customer Details">
            <Field label="Customer ID" required>
              <TextInput
                value={form.customer_id}
                onChange={handleField('customer_id')}
                disabled={idLocked}
              />
            </Field>
            <Field label="Customer Name" required>
              <TextInput
                value={form.customer_name}
                onChange={handleField('customer_name')}
                disabled={readOnly}
              />
            </Field>
          </FormSection>

          <FormSection icon={Phone} title="2. Contact Information">
            <Field label="Contact Person Name" required>
              <TextInput
                value={form.contact_person_name}
                onChange={handleField('contact_person_name')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Mobile Number" required>
              <TextInput
                value={form.mobile_number}
                onChange={handleField('mobile_number')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Email Address" required>
              <TextInput
                type="email"
                value={form.email_address}
                onChange={handleField('email_address')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Alternate Contact Number">
              <TextInput
                value={form.alternate_contact_number}
                onChange={handleField('alternate_contact_number')}
                disabled={readOnly}
              />
            </Field>
          </FormSection>

          <FormSection icon={Home} title="3. Registered Address">
            <Field label="Address" required className="lg:col-span-2">
              <TextInput
                value={form.registered_address}
                onChange={handleField('registered_address')}
                disabled={readOnly}
              />
            </Field>
            <Field label="City" required>
              <TextInput
                value={form.registered_city}
                onChange={handleField('registered_city')}
                disabled={readOnly}
              />
            </Field>
            <Field label="State" required>
              <TextInput
                value={form.registered_state}
                onChange={handleField('registered_state')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Pincode">
              <TextInput
                value={form.registered_pincode}
                onChange={handleField('registered_pincode')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Country">
              <TextInput
                value={form.registered_country}
                onChange={handleField('registered_country')}
                disabled={readOnly}
              />
            </Field>
          </FormSection>

          <FormSection icon={MapPin} title="4. Delivery Location">
            <Field label="Address" required className="lg:col-span-2">
              <TextInput
                value={form.delivery_address}
                onChange={handleField('delivery_address')}
                disabled={readOnly}
              />
            </Field>
            <Field label="City" required>
              <TextInput
                value={form.delivery_city}
                onChange={handleField('delivery_city')}
                disabled={readOnly}
              />
            </Field>
            <Field label="State" required>
              <TextInput
                value={form.delivery_state}
                onChange={handleField('delivery_state')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Pincode">
              <TextInput
                value={form.delivery_pincode}
                onChange={handleField('delivery_pincode')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Country">
              <TextInput
                value={form.delivery_country}
                onChange={handleField('delivery_country')}
                disabled={readOnly}
              />
            </Field>
          </FormSection>

          <FormSection icon={FileText} title="5. Statutory Details">
            <Field label="GSTIN Number">
              <TextInput
                value={form.gstin_number}
                onChange={handleField('gstin_number')}
                disabled={readOnly}
              />
            </Field>
            <Field label="PAN Number">
              <TextInput
                value={form.pan_number}
                onChange={handleField('pan_number')}
                disabled={readOnly}
              />
            </Field>
            <Field label="MSME / Udyam No.">
              <TextInput
                value={form.msme_udyam_no}
                onChange={handleField('msme_udyam_no')}
                disabled={readOnly}
              />
            </Field>
            <Field label="GST Registered">
              <SelectInput
                value={form.gst_registered}
                onChange={handleField('gst_registered')}
                disabled={readOnly}
                options={['true', 'false']}
              />
            </Field>
          </FormSection>

          <FormSection icon={Landmark} title="6. Commercial Details" columns={2}>
            <Field label="Payment Terms" required>
              <SelectInput
                value={form.payment_terms}
                onChange={handleField('payment_terms')}
                disabled={readOnly}
                options={['30 Days', '45 Days', '60 Days']}
              />
            </Field>
            <Field label="Currency" required>
              <SelectInput
                value={form.currency}
                onChange={handleField('currency')}
                disabled={readOnly}
                options={['INR', 'USD', 'EURO']}
              />
            </Field>
            <Field label="Status">
              <SelectInput
                value={form.status}
                onChange={handleField('status')}
                disabled={readOnly}
                options={['Active', 'Inactive']}
              />
            </Field>
          </FormSection>

          <FormSection icon={Settings} title="7. Customer Product & Drawing Details" columns={2}>
            <Field label="Customer Product Part Number">
              <TextInput
                value={form.customer_product_part_number}
                onChange={handleField('customer_product_part_number')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Customer Drawing Reference No" required>
              <TextInput
                value={form.customer_drawing_ref_no}
                onChange={handleField('customer_drawing_ref_no')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Customer Product Part Name">
              <TextInput
                value={form.customer_product_part_name}
                onChange={handleField('customer_product_part_name')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Revision Drawing No">
              <TextInput
                value={form.revision_drawing_no}
                onChange={handleField('revision_drawing_no')}
                disabled={readOnly}
              />
            </Field>
          </FormSection>
        </div>

        <RecordsList
          title="Customer List"
          columns={COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="customer_id"
          selectedKey={form.customer_id}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
