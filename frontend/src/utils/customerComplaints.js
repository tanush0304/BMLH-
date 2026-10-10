import { withTypedFields } from './numericFields'

export const SEVERITY_OPTIONS = ['Critical', 'Major', 'Minor']
export const PRIORITY_OPTIONS = ['High', 'Medium', 'Low']
export const ROOT_CAUSE_CATEGORY_OPTIONS = ['Man', 'Machine', 'Material', 'Method', 'Measurement', 'Environment']
export const INVESTIGATION_METHOD_OPTIONS = ['5 Why', 'Fishbone', 'Other']
export const COMPLAINT_STATUS_OPTIONS = ['Open', 'Under Investigation', 'Action Pending', 'Resolved', 'Closed']
// Built-ins for the two "+ Add new…" dropdowns; saved values are merged in.
export const COMPLAINT_SOURCE_OPTIONS = ['Email', 'Phone', 'Customer Visit', 'Field Report']
export const DEFECT_OPTIONS = ['Dimensional', 'Surface Finish', 'Burr', 'Damage', 'Wrong Part', 'Short Quantity']

// Images, PDF, Excel -- matches the bucket's allowed types (027).
export const ATTACHMENT_ACCEPT = 'image/*,.pdf,.xls,.xlsx'

// Sections 1-3 (Complaint Registration).
export const REGISTRATION_KEYS = [
  'complaint_date', 'customer_id', 'contact_person', 'contact_number_email', 'complaint_source',
  'part_serial_number', 'customer_po_no', 'invoice_no', 'batch_lot_no', 'qty_supplied', 'qty_complained', 'manufacturing_date',
  'complaint_type', 'complaint_category', 'complaint_description', 'defect_problem', 'severity', 'priority',
]

// Sections 4-7 (Investigation & Closure).
export const INVESTIGATION_KEYS = [
  'received_by', 'investigation_owner', 'initial_assessment', 'suspected_cause', 'affected_batch_jobs', 'containment_action', 'containment_date',
  'root_cause', 'root_cause_category', 'investigation_method', 'corrective_action', 'preventive_action', 'action_owner', 'target_completion_date',
  'replacement_required', 'rework_required', 'return_material_required', 'credit_debit_note_required', 'replacement_qty',
  'customer_communication', 'customer_response',
  'action_completion_date', 'effectiveness_check', 'customer_acceptance', 'status', 'closure_date', 'closed_by', 'closure_remarks',
]

const TYPED = {
  numeric: ['qty_supplied', 'qty_complained', 'replacement_qty'],
  date: ['complaint_date', 'manufacturing_date', 'containment_date', 'target_completion_date', 'action_completion_date', 'closure_date'],
  boolean: ['replacement_required', 'rework_required', 'return_material_required', 'credit_debit_note_required', 'customer_acceptance'],
}

export function emptyComplaintForm(today = new Date().toISOString().slice(0, 10)) {
  const form = Object.fromEntries([...REGISTRATION_KEYS, ...INVESTIGATION_KEYS].map((k) => [k, '']))
  form.complaint_date = today
  form.status = 'Open'
  return form
}

/** DB row -> form state (null -> "", booleans -> "true"/"false" for YES_NO_OPTIONS). */
export function complaintToForm(row) {
  const form = emptyComplaintForm('')
  for (const key of Object.keys(form)) {
    const v = row?.[key]
    form[key] = v === null || v === undefined ? '' : String(v)
  }
  return form
}

// Every other field is text (incl. selects / employee ids): blank -> null.
function toPayload(form, keys) {
  const picked = Object.fromEntries(keys.map((k) => [k, form[k]]))
  const typed = new Set([...TYPED.numeric, ...TYPED.date, ...TYPED.boolean])
  return withTypedFields(picked, { ...TYPED, text: keys.filter((k) => !typed.has(k)) })
}

/** Screen 1 insert: sections 1-3, status always 'Open'. */
export function registrationPayload(form) {
  return { ...toPayload(form, REGISTRATION_KEYS), status: 'Open' }
}

/** Screen 2 update: sections 4-7 only (1-3 are read-only there). */
export function investigationPayload(form) {
  return toPayload(form, INVESTIGATION_KEYS)
}

export function validateRegistration(form) {
  if (!form.complaint_date || !form.customer_id || !form.part_serial_number) {
    return 'Complaint Date, Customer Name and Part Serial Number are required.'
  }
  const supplied = form.qty_supplied === '' ? null : Number(form.qty_supplied)
  const complained = form.qty_complained === '' ? null : Number(form.qty_complained)
  if ((supplied !== null && supplied < 0) || (complained !== null && complained < 0)) {
    return 'Quantities cannot be negative.'
  }
  if (supplied !== null && complained !== null && complained > supplied) {
    return 'Quantity Complained cannot be more than Quantity Supplied.'
  }
  return null
}

export function isSupervisor(role) {
  return role === 'supervisor' || role === 'admin'
}

/** Status options this role may pick: 'Closed' is supervisor/admin only. */
export function statusOptionsForRole(role, currentStatus) {
  if (isSupervisor(role) || currentStatus === 'Closed') return COMPLAINT_STATUS_OPTIONS
  return COMPLAINT_STATUS_OPTIONS.filter((s) => s !== 'Closed')
}

export function validateInvestigation(form, role, previousStatus) {
  if (Number(form.replacement_qty) < 0) return 'Replacement Quantity cannot be negative.'
  if (form.status === 'Closed' && previousStatus !== 'Closed' && !isSupervisor(role)) {
    return 'Only a supervisor or admin can close a complaint.'
  }
  if (form.status === 'Closed' && (!form.closure_date || !form.closed_by)) {
    return 'Closure Date and Closed By are required to close a complaint.'
  }
  return null
}

/** Rows for the Complaint List (adds display names + Sl No). */
export function complaintListRows(complaints, customers, products) {
  const customerName = new Map(customers.map((c) => [c.customer_id, c.customer_name || c.customer_id]))
  const partName = new Map(products.map((p) => [p.part_serial_number, p.part_name]))
  return complaints.map((c, i) => ({
    ...c,
    sl_no: i + 1,
    customer_name: customerName.get(c.customer_id) ?? c.customer_id ?? '',
    part_label: c.part_serial_number
      ? `${c.part_serial_number}${partName.get(c.part_serial_number) ? ` – ${partName.get(c.part_serial_number)}` : ''}`
      : '',
  }))
}

export function filterComplaintRows(rows, search) {
  if (!search) return rows
  const q = search.toLowerCase()
  return rows.filter((r) =>
    [r.complaint_no, r.complaint_date, r.customer_name, r.part_label, r.defect_problem, r.priority, r.status].some((v) =>
      String(v ?? '').toLowerCase().includes(q)
    )
  )
}
