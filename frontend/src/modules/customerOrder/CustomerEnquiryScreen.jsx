import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useMemo, useState } from 'react'
import { FileText, GitBranch } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import { productOptions } from '../../utils/productOptions'
import RecordsList from '../../components/RecordsList'
import {
  listCustomerEnquiries,
  createCustomerEnquiry,
  updateCustomerEnquiry,
  deleteCustomerEnquiry,
  generateNextQtnNo,
  createEnquiryRevision,
} from '../../data/queries/customerEnquiries'
import { listCustomers } from '../../data/queries/customers'
import { listProducts, resolveProductWithConfirmation } from '../../data/queries/products'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { customerDropdownOptions } from '../../utils/customerLabel'
import { todayISO } from '../../utils/dates'
import { deriveEnquiryStatuses } from '../../utils/enquiryStatus'
import { toNumberOrNull } from '../../utils/numericFields'

const NEW_PART_VALUE = '__new__'

const EMPTY_FORM = {
  qtn_no: '',
  parent_qtn_no: '',
  revision_no: '',
  customer_id: '',
  drawing_number: '',
  part_serial_number: '',
  part_name: '',
  quoted_price: '',
  quoted_date: '',
  supply_lead_time_days: '',
  revision_status: '',
}

// Status and Linked PRD(s) are injected per-row at render time (see
// statusColumns below) -- they're derived (utils/enquiryStatus.js), never
// stored, so they need the full enquiries+orders list to compute, not
// just the one row RecordsList's `render` normally gets.
const LIST_COLUMNS = [
  { key: 'qtn_no', label: 'QTN No' },
  { key: 'parent_qtn_no', label: 'Revision Of', render: (r) => r.parent_qtn_no ?? '—' },
  { key: 'revision_no', label: 'Rev No', render: (r) => r.revision_no ?? '—' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'drawing_number', label: 'Drawing Number' },
  { key: 'quoted_price', label: 'Quoted Price' },
  { key: 'quoted_date', label: 'Quoted Date' },
  { key: 'revision_status', label: 'Revision Status' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'linked_prds', label: 'Linked PRD(s)', render: (r) => (r.linked_prds?.length ? r.linked_prds.join(', ') : '—') },
]

export default function CustomerEnquiryScreen() {
  const [records, setRecords] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  // Set only while drafting a revision of an existing enquiry -- the root
  // QTN this new row will link back to via parent_qtn_no. Not the same as
  // form.parent_qtn_no, which (once saved) reflects what's actually stored.
  const [revisingRoot, setRevisingRoot] = useState(null)
  // "Add New Part" state for Part Serial Number -- same pattern as New
  // Customer Order's line items: typing a new value doesn't persist
  // anything until save (see resolveOrCreateProduct).
  const [isNewPart, setIsNewPart] = useState(false)
  const [newPartCode, setNewPartCode] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [enquiries, custs, prods, ords] = await Promise.all([
        listCustomerEnquiries(),
        listCustomers(),
        listProducts(),
        listCustomerOrders(),
      ])
      setRecords(enquiries)
      setCustomers(custs)
      setProducts(prods)
      setOrders(ords)
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

  function resetPartPicker() {
    setIsNewPart(false)
    setNewPartCode('')
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setMode('new')
    setRevisingRoot(null)
    setSaveError(null)
    resetPartPicker()
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setMode('new')
    setRevisingRoot(null)
    setSaveError(null)
    resetPartPicker()
  }

  function handleRowClick(row) {
    setForm({ ...EMPTY_FORM, ...row })
    setMode('view')
    setRevisingRoot(null)
    setSaveError(null)
    resetPartPicker()
  }

  function handleEdit() {
    if (!form.qtn_no) return
    setMode('edit')
  }

  // Starts a new enquiry pre-filled from the one currently being viewed,
  // linked back to it as a revision on save -- root is the CURRENT row's
  // own root (its parent_qtn_no if it's already a revision, else its own
  // qtn_no), so every revision of an enquiry points to one common original
  // instead of chaining off whichever revision happened to be open.
  //
  // Per spec, a revision is "for same product and same customer" -- it
  // always continues from the original's already-resolved part_serial_number
  // (never "add new part" mode), and Customer/Part Serial Number/Part Name
  // stay locked (see isRevision below) so a revision can't drift onto a
  // different customer's quote or a different part.
  function handleCreateRevision() {
    const root = form.parent_qtn_no || form.qtn_no
    setRevisingRoot(root)
    resetPartPicker()
    setForm({ ...form, qtn_no: '', parent_qtn_no: '', revision_no: '' })
    setMode('new')
    setSaveError(null)
  }

  function handlePartChange(e) {
    const value = e.target.value
    if (value === NEW_PART_VALUE) {
      setIsNewPart(true)
      setNewPartCode('')
      setForm((f) => ({ ...f, part_serial_number: '', part_name: '' }))
      return
    }
    setIsNewPart(false)
    setNewPartCode('')
    const product = products.find((p) => p.part_serial_number === value)
    setForm((f) => ({
      ...f,
      part_serial_number: value,
      part_name: product?.part_name ?? '',
      // Pre-fill from Product Master, but stays editable -- never written
      // back to the product row, since resolveOrCreateProduct only ever
      // creates a NEW row, it never updates an existing one.
      drawing_number: product?.part_drawing_reference_number ?? '',
    }))
  }

  async function handleSave() {
    if (!form.customer_id) {
      setSaveError('Customer is required.')
      return
    }
    if (isNewPart) {
      if (!newPartCode.trim()) {
        setSaveError('Enter a part number for the newly-typed part, or pick an existing one.')
        return
      }
      if (!form.part_name.trim()) {
        setSaveError('Part Name is required for a newly-typed part (nothing to auto-fill from yet).')
        return
      }
    }
    setSaving(true)
    setSaveError(null)
    try {
      const resolved = await resolveProductWithConfirmation({
        isNewPart,
        partSerialNumber: form.part_serial_number,
        newPartCode,
        partName: form.part_name,
        drawingNumber: form.drawing_number,
        knownProducts: products,
      })
      if (resolved.knownProducts !== products) setProducts(resolved.knownProducts)

      const payload = {
        customer_id: form.customer_id,
        drawing_number: form.drawing_number || null,
        part_serial_number: resolved.partSerialNumber || null,
        part_name: form.part_name || null,
        quoted_price: toNumberOrNull(form.quoted_price),
        // System date, set once at creation/revision and never re-typed --
        // form.quoted_date is read-only, so on an edit this just resends
        // whatever was already stored.
        quoted_date: form.quoted_date || todayISO(),
        supply_lead_time_days: toNumberOrNull(form.supply_lead_time_days),
        revision_status: form.revision_status || null,
      }
      let saved
      if (mode === 'edit') {
        // qtn_no is never user-editable, including in edit mode.
        saved = await updateCustomerEnquiry(form.qtn_no, payload)
      } else if (revisingRoot) {
        saved = await createEnquiryRevision(revisingRoot, payload)
      } else {
        const qtnNo = await generateNextQtnNo()
        saved = await createCustomerEnquiry({ qtn_no: qtnNo, ...payload })
      }
      setRevisingRoot(null)
      resetPartPicker()
      setForm({ ...EMPTY_FORM, ...saved })
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

  function handleExportExcel() {
    exportToCsv(LIST_COLUMNS, filteredRecords, 'customer_enquiries.csv')
  }

  function handleExportPdf() {
    exportToPdf(LIST_COLUMNS, filteredRecords, 'Customer Enquiries', 'customer_enquiries')
  }

  const statusByQtn = useMemo(() => deriveEnquiryStatuses(records, orders), [records, orders])

  const filteredRecords = records
    .filter((r) => {
      if (!listSearch) return true
      const q = listSearch.toLowerCase()
      return r.qtn_no?.toLowerCase().includes(q) || r.customer_id?.toLowerCase().includes(q)
    })
    .map((r) => {
      const derived = statusByQtn.get(r.qtn_no)
      return { ...r, status: derived?.status ?? 'Open', linked_prds: derived?.linkedPrds ?? [] }
    })

  const readOnly = mode === 'view'
  // A revision -- either currently being drafted (revisingRoot set, not
  // yet saved) or an already-saved row that IS one (form.parent_qtn_no
  // set) -- can never change which customer or part it's for.
  const isRevision = !!revisingRoot || !!form.parent_qtn_no
  const partLocked = readOnly || isRevision

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="New Enquiry" subtitle="Quotation Stage  |  Enquiry to Quote" />
      <ActionToolbar
        onNew={handleNew}
        onSave={handleSave}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClear={handleClear}
        canSave={!readOnly && !saving}
        canEdit={mode === 'view'}
        canDelete={mode !== 'new' && !saving}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <FormSection icon={FileText} title="1. Enquiry Details" subtitle="Prospective customer request" columns={3}>
          <Field label="QTN No">
            {/* Auto-generated on save (QTN-001, QTN-002, ...) -- never
                user-entered, so there's nothing to type or lock here. */}
            <AutoFillBox value={form.qtn_no || (revisingRoot ? `New revision of ${revisingRoot}` : '(auto-generated on save)')} />
          </Field>
          {form.parent_qtn_no && (
            <Field label="Revision Of">
              <AutoFillBox value={`${form.parent_qtn_no} (Rev ${form.revision_no})`} />
            </Field>
          )}
          {readOnly && form.qtn_no && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleCreateRevision}
                className="inline-flex items-center gap-1.5 bg-bmlhsky text-bmlhblue rounded px-3 py-1.5 text-xs font-medium hover:bg-[#c9def6]"
              >
                <GitBranch size={14} /> Create Revision
              </button>
            </div>
          )}
          <Field label="Customer" required>
            <SearchableSelect
              value={form.customer_id}
              onChange={handleField('customer_id')}
              disabled={readOnly || isRevision}
              options={customerDropdownOptions(customers)}
            />
          </Field>
          <Field label="Customer ID">
            <AutoFillBox value={form.customer_id} />
          </Field>
          <Field label="Part Serial Number" required>
            {isNewPart ? (
              <TextInput
                value={newPartCode}
                onChange={(e) => setNewPartCode(e.target.value)}
                disabled={partLocked}
                placeholder="Type new part number"
              />
            ) : (
              <SearchableSelect
                value={form.part_serial_number}
                onChange={handlePartChange}
                disabled={partLocked}
                options={[
                  ...productOptions(products),
                  { value: NEW_PART_VALUE, label: '+ Add New Part...' },
                ]}
              />
            )}
          </Field>
          {isNewPart && !partLocked && (
            <div className="flex items-end">
              <button type="button" onClick={resetPartPicker} className="text-xs text-bmlhblue hover:underline">
                Pick existing instead
              </button>
            </div>
          )}
          <Field label="Part Name">
            <TextInput value={form.part_name} onChange={handleField('part_name')} disabled={partLocked} />
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
            <AutoFillBox value={form.quoted_date || todayISO()} />
          </Field>
          <Field label="Supply Lead Time (days)">
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
          onSearchChange={setListSearch} searchPlaceholder="Search by QTN No / Customer..."
        />
      </div>
    </div>
  )
}
