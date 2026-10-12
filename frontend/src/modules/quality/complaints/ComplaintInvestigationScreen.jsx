import { useEffect, useState } from 'react'
import { CircleCheck, Microscope, SearchCheck, Wrench } from 'lucide-react'
import ActionToolbar from '../../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../../components/FormSection'
import SearchableSelect from '../../../components/SearchableSelect'
import EmployeeSelect from '../../../components/EmployeeSelect'
import { exportToCsv, exportToPdf } from '../../../utils/exportUtils'
import { YES_NO_OPTIONS } from '../../../utils/numericFields'
import {
  complaintAttachmentUrl,
  listComplaintAttachments,
  updateComplaint,
} from '../../../data/queries/customerComplaints'
import {
  INVESTIGATION_METHOD_OPTIONS,
  ROOT_CAUSE_CATEGORY_OPTIONS,
  complaintToForm,
  emptyComplaintForm,
  filterComplaintRows,
  investigationPayload,
  isSupervisor,
  statusOptionsForRole,
  validateInvestigation,
} from '../../../utils/customerComplaints'
import ComplaintRegistrationSections from './ComplaintRegistrationSections'
import ComplaintList, { COMPLAINT_EXPORT_COLUMNS } from './ComplaintList'
import useComplaintData from './useComplaintData'

const RESOLUTION_FLAGS = [
  ['replacement_required', 'Replacement Required'],
  ['rework_required', 'Rework Required'],
  ['return_material_required', 'Return Material Required'],
  ['credit_debit_note_required', 'Credit / Debit Note Required'],
]

/** Investigation & Closure tab of Customer Complaint -- picks a non-closed complaint (or one opened from a list),
 * shows sections 1-3 read-only and records sections 4-7. Setting Closed is
 * supervisor/admin only (also enforced in the DB, 027). */
export default function ComplaintInvestigationScreen({ role, initialComplaintNo }) {
  const data = useComplaintData()
  const [complaintNo, setComplaintNo] = useState(initialComplaintNo ?? '')
  const [form, setForm] = useState(() => emptyComplaintForm(''))
  const [attachments, setAttachments] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const selected = data.complaints.find((c) => c.complaint_no === complaintNo)

  // Load the chosen complaint into the form (and its files).
  useEffect(() => {
    setForm(selected ? complaintToForm(selected) : emptyComplaintForm(''))
    setAttachments([])
    if (!selected) return
    let cancelled = false
    listComplaintAttachments(selected.id)
      .then((rows) => !cancelled && setAttachments(rows))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [selected])

  useEffect(() => {
    if (initialComplaintNo) setComplaintNo(initialComplaintNo)
  }, [initialComplaintNo])

  const locked = !selected || (selected.status === 'Closed' && !isSupervisor(role))
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Searchable list: every non-closed complaint, plus the open one if it is closed.
  const pickable = data.complaints
    .filter((c) => c.status !== 'Closed' || c.complaint_no === complaintNo)
    .map((c) => c.complaint_no)

  function handleClear() {
    setComplaintNo('')
    setError(null)
    setMessage('')
  }

  async function handleSave() {
    if (!selected) {
      setError('Select a Complaint No first.')
      return
    }
    const problem = validateInvestigation(form, role, selected.status)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    setMessage('')
    try {
      await updateComplaint(selected.id, investigationPayload(form))
      await data.refresh()
      setMessage(`Complaint ${selected.complaint_no} saved.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Open the tab inside the click (a window.open after the await would be
  // popup-blocked), then point it at the signed URL once it arrives.
  async function openAttachment(a) {
    const win = window.open('', '_blank')
    if (win) win.opener = null
    try {
      const url = await complaintAttachmentUrl(a.file_path)
      if (win) win.location.href = url
      else window.location.assign(url)
    } catch (e) {
      win?.close()
      setError(e.message)
    }
  }

  const rows = filterComplaintRows(data.rows, search)
  const employees = data.employees

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <ActionToolbar
        showEditDelete={false}
        saving={saving}
        canSave={!locked}
        onNew={handleClear}
        onSave={handleSave}
        onClear={handleClear}
        onExportExcel={() => exportToCsv(COMPLAINT_EXPORT_COLUMNS, rows, 'customer_complaints.csv')}
        onExportPdf={() => exportToPdf(COMPLAINT_EXPORT_COLUMNS, rows, 'Customer Complaints', 'customer_complaints')}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {(error || data.error) && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error || data.error}</div>
        )}
        {message && !error && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded">{message}</div>
        )}

        {selected?.status === 'Closed' && !isSupervisor(role) && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2 rounded">
            This complaint is closed. Only a supervisor or admin can change it.
          </div>
        )}

        <ComplaintRegistrationSections
          form={form}
          onChange={() => {}}
          readOnly
          complaintNoPicker={
            <SearchableSelect
              value={complaintNo}
              onChange={(e) => {
                setComplaintNo(e.target.value)
                setError(null)
                setMessage('')
              }}
              options={pickable}
            />
          }
          customers={data.customers}
          products={data.products}
          sourceOptions={data.sourceOptions}
          defectOptions={data.defectOptions}
          attachments={attachments}
          onOpenAttachment={openAttachment}
        />

        {/* Sections 4-7 stay visible but locked until a complaint is picked. */}
        <>
          <FormSection icon={SearchCheck} title="4. Initial Investigation" subtitle="First look and containment">
            <Field label="Complaint Received By">
              <EmployeeSelect employees={employees} value={form.received_by} onChange={set('received_by')} disabled={locked} />
            </Field>
            <Field label="Investigation Owner">
              <EmployeeSelect employees={employees} value={form.investigation_owner} onChange={set('investigation_owner')} disabled={locked} />
            </Field>
            <Field label="Initial Assessment" width="long">
              <TextInput value={form.initial_assessment} onChange={set('initial_assessment')} disabled={locked} />
            </Field>
            <Field label="Suspected Cause" width="long">
              <TextInput value={form.suspected_cause} onChange={set('suspected_cause')} disabled={locked} />
            </Field>
            <Field label="Affected Batch / Jobs">
              <TextInput value={form.affected_batch_jobs} onChange={set('affected_batch_jobs')} disabled={locked} />
            </Field>
            <Field label="Immediate Containment Action" width="long">
              <TextInput value={form.containment_action} onChange={set('containment_action')} disabled={locked} />
            </Field>
            <Field label="Containment Date" width="short">
              <TextInput type="date" value={form.containment_date} onChange={set('containment_date')} disabled={locked} />
            </Field>
          </FormSection>

          <FormSection icon={Microscope} title="5. Root Cause Analysis" subtitle="Why it happened and what will stop it">
            <Field label="Root Cause" width="long">
              <TextInput value={form.root_cause} onChange={set('root_cause')} disabled={locked} />
            </Field>
            <Field label="Root Cause Category">
              <SelectInput value={form.root_cause_category} onChange={set('root_cause_category')} options={ROOT_CAUSE_CATEGORY_OPTIONS} disabled={locked} />
            </Field>
            <Field label="Investigation Method">
              <SelectInput value={form.investigation_method} onChange={set('investigation_method')} options={INVESTIGATION_METHOD_OPTIONS} disabled={locked} />
            </Field>
            <Field label="Corrective Action" width="long">
              <TextInput value={form.corrective_action} onChange={set('corrective_action')} disabled={locked} />
            </Field>
            <Field label="Preventive Action" width="long">
              <TextInput value={form.preventive_action} onChange={set('preventive_action')} disabled={locked} />
            </Field>
            <Field label="Action Owner">
              <EmployeeSelect employees={employees} value={form.action_owner} onChange={set('action_owner')} disabled={locked} />
            </Field>
            <Field label="Target Completion Date" width="short">
              <TextInput type="date" value={form.target_completion_date} onChange={set('target_completion_date')} disabled={locked} />
            </Field>
          </FormSection>

          <FormSection icon={Wrench} title="6. Resolution" subtitle="What the customer gets">
            {RESOLUTION_FLAGS.map(([key, label]) => (
              <Field key={key} label={label} width="short">
                <SelectInput value={form[key]} onChange={set(key)} options={YES_NO_OPTIONS} disabled={locked} />
              </Field>
            ))}
            <Field label="Replacement Quantity" width="short">
              <TextInput type="number" min="0" value={form.replacement_qty} onChange={set('replacement_qty')} disabled={locked} />
            </Field>
            <Field label="Customer Communication" width="long">
              <TextInput value={form.customer_communication} onChange={set('customer_communication')} disabled={locked} />
            </Field>
            <Field label="Customer Response" width="long">
              <TextInput value={form.customer_response} onChange={set('customer_response')} disabled={locked} />
            </Field>
          </FormSection>

          <FormSection icon={CircleCheck} title="7. Closure" subtitle="Closed = supervisor / admin only">
            <Field label="Action Completion Date" width="short">
              <TextInput type="date" value={form.action_completion_date} onChange={set('action_completion_date')} disabled={locked} />
            </Field>
            <Field label="Effectiveness Check" width="long">
              <TextInput value={form.effectiveness_check} onChange={set('effectiveness_check')} disabled={locked} />
            </Field>
            <Field label="Customer Acceptance" width="short">
              <SelectInput value={form.customer_acceptance} onChange={set('customer_acceptance')} options={YES_NO_OPTIONS} disabled={locked} />
            </Field>
            <Field label="Complaint Status" required>
              <SelectInput value={form.status} onChange={set('status')} options={statusOptionsForRole(role, selected?.status)} disabled={locked} />
            </Field>
            <Field label="Closure Date" width="short">
              <TextInput type="date" value={form.closure_date} onChange={set('closure_date')} disabled={locked} />
            </Field>
            <Field label="Closed By">
              <EmployeeSelect employees={employees} value={form.closed_by} onChange={set('closed_by')} disabled={locked} />
            </Field>
            <Field label="Closure Remarks" width="long">
              <TextInput value={form.closure_remarks} onChange={set('closure_remarks')} disabled={locked} />
            </Field>
          </FormSection>
        </>

        <ComplaintList
          rows={rows}
          loading={data.loading}
          search={search}
          onSearchChange={setSearch}
          selectedKey={complaintNo}
          onRowClick={(row) => {
            setComplaintNo(row.complaint_no)
            setError(null)
            setMessage('')
          }}
        />
      </div>
    </div>
  )
}
