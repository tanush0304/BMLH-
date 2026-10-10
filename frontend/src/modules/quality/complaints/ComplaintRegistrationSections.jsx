import { MessageSquareWarning, Package, Tags } from 'lucide-react'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../../components/FormSection'
import SearchableSelect from '../../../components/SearchableSelect'
import SelectWithAddNew from '../../../components/SelectWithAddNew'
import { customerDropdownOptions } from '../../../utils/customerLabel'
import { ATTACHMENT_ACCEPT, PRIORITY_OPTIONS, SEVERITY_OPTIONS } from '../../../utils/customerComplaints'

/**
 * Sections 1-3 of a complaint. Editable on Complaint Registration; shown
 * read-only (readOnly) on Investigation & Closure, where Complaint No is
 * the complaint picker (complaintNoPicker).
 */
export default function ComplaintRegistrationSections({
  form,
  onChange,
  readOnly = false,
  complaintNo,
  complaintNoPicker,
  customers,
  products,
  sourceOptions,
  defectOptions,
  newFiles = [],
  onNewFilesChange,
  attachments = [],
  onOpenAttachment,
}) {
  const set = (key) => (e) => onChange({ [key]: e.target.value })
  const customer = customers.find((c) => c.customer_id === form.customer_id)
  const product = products.find((p) => p.part_serial_number === form.part_serial_number)

  // Contact person / number default from Customer Master; still editable.
  function handleCustomerChange(e) {
    const id = e.target.value
    const c = customers.find((x) => x.customer_id === id)
    onChange({
      customer_id: id,
      contact_person: form.contact_person || c?.contact_person_name || '',
      contact_number_email: form.contact_number_email || c?.mobile_number || c?.email_address || '',
    })
  }

  return (
    <>
      <FormSection icon={MessageSquareWarning} title="1. Complaint Details" subtitle="Who complained and how">
        <Field label="Complaint No">
          {complaintNoPicker ?? <TextInput value={complaintNo || '(auto-generated on save)'} readOnly />}
        </Field>
        <Field label="Complaint Date" required width="short">
          <TextInput type="date" value={form.complaint_date} onChange={set('complaint_date')} disabled={readOnly} />
        </Field>
        <Field label="Customer Name" required>
          <SearchableSelect value={form.customer_id} onChange={handleCustomerChange} options={customerDropdownOptions(customers)} disabled={readOnly} />
        </Field>
        <Field label="Customer Code" width="short">
          <AutoFillBox value={customer?.customer_id ?? ''} />
        </Field>
        <Field label="Customer Contact Person">
          <TextInput value={form.contact_person} onChange={set('contact_person')} disabled={readOnly} />
        </Field>
        <Field label="Contact Number / Email">
          <TextInput value={form.contact_number_email} onChange={set('contact_number_email')} disabled={readOnly} />
        </Field>
        <Field label="Complaint Source">
          <SelectWithAddNew value={form.complaint_source} onChange={set('complaint_source')} options={sourceOptions} disabled={readOnly} />
        </Field>
      </FormSection>

      <FormSection icon={Package} title="2. Product Details" subtitle="Part and supply references">
        <Field label="Part Serial Number" required>
          <SearchableSelect
            value={form.part_serial_number}
            onChange={set('part_serial_number')}
            options={products.map((p) => p.part_serial_number)}
            disabled={readOnly}
          />
        </Field>
        <Field label="Part Name">
          <AutoFillBox value={product?.part_name ?? ''} />
        </Field>
        <Field label="Customer PO No" width="short">
          <TextInput value={form.customer_po_no} onChange={set('customer_po_no')} disabled={readOnly} />
        </Field>
        <Field label="Invoice No" width="short">
          <TextInput value={form.invoice_no} onChange={set('invoice_no')} disabled={readOnly} />
        </Field>
        <Field label="Batch / Lot No" width="short">
          <TextInput value={form.batch_lot_no} onChange={set('batch_lot_no')} disabled={readOnly} />
        </Field>
        <Field label="Quantity Supplied" width="short">
          <TextInput type="number" min="0" value={form.qty_supplied} onChange={set('qty_supplied')} disabled={readOnly} />
        </Field>
        <Field label="Quantity Complained" width="short">
          <TextInput type="number" min="0" value={form.qty_complained} onChange={set('qty_complained')} disabled={readOnly} />
        </Field>
        <Field label="Manufacturing Date" width="short">
          <TextInput type="date" value={form.manufacturing_date} onChange={set('manufacturing_date')} disabled={readOnly} />
        </Field>
      </FormSection>

      <FormSection icon={Tags} title="3. Complaint Classification" subtitle="What is wrong and how serious">
        <Field label="Complaint Type">
          <TextInput value={form.complaint_type} onChange={set('complaint_type')} disabled={readOnly} />
        </Field>
        <Field label="Complaint Category">
          <TextInput value={form.complaint_category} onChange={set('complaint_category')} disabled={readOnly} />
        </Field>
        <Field label="Defect / Problem">
          <SelectWithAddNew value={form.defect_problem} onChange={set('defect_problem')} options={defectOptions} disabled={readOnly} />
        </Field>
        <Field label="Severity" width="short">
          <SelectInput value={form.severity} onChange={set('severity')} options={SEVERITY_OPTIONS} disabled={readOnly} />
        </Field>
        <Field label="Priority" width="short">
          <SelectInput value={form.priority} onChange={set('priority')} options={PRIORITY_OPTIONS} disabled={readOnly} />
        </Field>
        <Field label="Complaint Description" width="long" className="basis-full">
          <TextInput value={form.complaint_description} onChange={set('complaint_description')} disabled={readOnly} />
        </Field>
        <Field label="Photos / Documents (images, PDF, Excel)" width="long" className="basis-full">
          {!readOnly && (
            <input
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              onChange={(e) => onNewFilesChange?.(Array.from(e.target.files ?? []))}
              className="input-manual w-full rounded border px-2.5 py-1 text-xs"
            />
          )}
          {(attachments.length > 0 || newFiles.length > 0) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
              {attachments.map((a) => (
                <button key={a.id} type="button" onClick={() => onOpenAttachment?.(a)} className="text-bmlhblue hover:underline">
                  {a.file_name}
                </button>
              ))}
              {newFiles.map((f) => (
                <span key={f.name} className="text-gray-500">
                  {f.name} (to upload)
                </span>
              ))}
            </div>
          )}
          {readOnly && attachments.length === 0 && <AutoFillBox value="" placeholder="No files attached" />}
        </Field>
      </FormSection>
    </>
  )
}
