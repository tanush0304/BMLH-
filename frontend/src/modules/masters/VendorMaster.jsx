import { useEffect, useState } from 'react'
import { Truck as TruckIcon, Phone, Landmark, ListChecks } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listVendors, createVendor, updateVendor, deleteVendor } from '../../data/queries/vendors'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import { listJobWorkTypesForVendor, setVendorJobWorkTypes } from '../../data/queries/vendorJobWorkTypes'

const EMPTY_FORM = {
  vendor_id: '',
  vendor_name: '',
  vendor_address: '',
  contact_person_name: '',
  mobile_no: '',
  email_id: '',
  gstin_no: '',
  pan_no: '',
  udyam_msme_no: '',
  gst_category: '',
  tds_applicable: '',
  payment_terms: '',
  credit_period: '',
  bank_account_no: '',
  bank_name: '',
  ifsc_code: '',
}

const LIST_COLUMNS = [
  { key: 'vendor_id', label: 'Vendor ID' },
  { key: 'vendor_name', label: 'Vendor Name' },
  { key: 'contact_person_name', label: 'Contact Person' },
  { key: 'mobile_no', label: 'Mobile Number' },
  { key: 'gst_category', label: 'GST Category' },
]

export default function VendorMaster() {
  const [records, setRecords] = useState([])
  const [jobWorkTypes, setJobWorkTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedJobWorkCodes, setSelectedJobWorkCodes] = useState([])
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [vendors, jwts] = await Promise.all([listVendors(), listJobWorkTypes()])
      setRecords(vendors)
      setJobWorkTypes(jwts)
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

  function toggleJobWorkCode(code) {
    setSelectedJobWorkCodes((codes) =>
      codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]
    )
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setSelectedJobWorkCodes([])
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setSelectedJobWorkCodes([])
    setMode('new')
    setSaveError(null)
  }

  async function handleRowClick(row) {
    setForm({ ...EMPTY_FORM, ...row })
    setMode('view')
    setSaveError(null)
    try {
      const links = await listJobWorkTypesForVendor(row.vendor_id)
      setSelectedJobWorkCodes(links.map((l) => l.job_work_code))
    } catch (e) {
      setSaveError(e.message)
    }
  }

  function handleEdit() {
    if (!form.vendor_id) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.vendor_id || !form.vendor_name) {
      setSaveError('Vendor ID and Vendor Name are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { ...form, tds_applicable: form.tds_applicable === 'true' }
      if (mode === 'edit') {
        await updateVendor(form.vendor_id, payload)
      } else {
        await createVendor(payload)
      }
      await setVendorJobWorkTypes(form.vendor_id, selectedJobWorkCodes)
      await refresh()
      setMode('view')
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!form.vendor_id) return
    if (!confirm(`Delete vendor ${form.vendor_id}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteVendor(form.vendor_id)
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
    a.download = 'vendor_master.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return r.vendor_id?.toLowerCase().includes(q) || r.vendor_name?.toLowerCase().includes(q)
  })

  const readOnly = mode === 'view'
  const idLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Vendor Master" subtitle="Manage Vendor Information  |  Outsourcing Partners" />
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
        searchPlaceholder="Search by Vendor ID / Name..."
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
          <FormSection icon={TruckIcon} title="1. Vendor Details" columns={2}>
            <Field label="Vendor ID" required>
              <TextInput value={form.vendor_id} onChange={handleField('vendor_id')} disabled={idLocked} />
            </Field>
            <Field label="Vendor Name" required>
              <TextInput value={form.vendor_name} onChange={handleField('vendor_name')} disabled={readOnly} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <TextInput value={form.vendor_address} onChange={handleField('vendor_address')} disabled={readOnly} />
            </Field>
          </FormSection>

          <FormSection icon={Phone} title="2. Contact Information">
            <Field label="Contact Person Name">
              <TextInput
                value={form.contact_person_name}
                onChange={handleField('contact_person_name')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Mobile Number">
              <TextInput value={form.mobile_no} onChange={handleField('mobile_no')} disabled={readOnly} />
            </Field>
            <Field label="Email Address">
              <TextInput type="email" value={form.email_id} onChange={handleField('email_id')} disabled={readOnly} />
            </Field>
          </FormSection>

          <FormSection icon={ListChecks} title="3. Job Work Types Performed" columns={1}>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {jobWorkTypes.map((jwt) => (
                <label key={jwt.job_work_code} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedJobWorkCodes.includes(jwt.job_work_code)}
                    onChange={() => toggleJobWorkCode(jwt.job_work_code)}
                    disabled={readOnly}
                    className="rounded border-gray-300"
                  />
                  {jwt.type_of_job_work}
                </label>
              ))}
              {jobWorkTypes.length === 0 && (
                <p className="text-sm text-gray-400">No job work types defined yet.</p>
              )}
            </div>
          </FormSection>

          <FormSection icon={Landmark} title="4. Statutory & Commercial Details" columns={2}>
            <Field label="GSTIN No">
              <TextInput value={form.gstin_no} onChange={handleField('gstin_no')} disabled={readOnly} />
            </Field>
            <Field label="PAN No">
              <TextInput value={form.pan_no} onChange={handleField('pan_no')} disabled={readOnly} />
            </Field>
            <Field label="MSME / Udyam No">
              <TextInput value={form.udyam_msme_no} onChange={handleField('udyam_msme_no')} disabled={readOnly} />
            </Field>
            <Field label="GST Category">
              <SelectInput
                value={form.gst_category}
                onChange={handleField('gst_category')}
                disabled={readOnly}
                options={['Registered', 'Unregistered', 'Composition']}
              />
            </Field>
            <Field label="TDS Applicable">
              <SelectInput
                value={form.tds_applicable}
                onChange={handleField('tds_applicable')}
                disabled={readOnly}
                options={['true', 'false']}
              />
            </Field>
            <Field label="Payment Terms">
              <SelectInput
                value={form.payment_terms}
                onChange={handleField('payment_terms')}
                disabled={readOnly}
                options={['30 Days', '60 Days', '90 Days']}
              />
            </Field>
            <Field label="Credit Period">
              <TextInput value={form.credit_period} onChange={handleField('credit_period')} disabled={readOnly} />
            </Field>
            <Field label="Bank Account No">
              <TextInput value={form.bank_account_no} onChange={handleField('bank_account_no')} disabled={readOnly} />
            </Field>
            <Field label="Bank Name">
              <TextInput value={form.bank_name} onChange={handleField('bank_name')} disabled={readOnly} />
            </Field>
            <Field label="IFSC Code">
              <TextInput value={form.ifsc_code} onChange={handleField('ifsc_code')} disabled={readOnly} />
            </Field>
          </FormSection>
        </div>

        <RecordsList
          title="Vendor Master List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="vendor_id"
          selectedKey={form.vendor_id}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
