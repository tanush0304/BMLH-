import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import FormSection, { Field, TextInput, AutoFillBox } from './FormSection'
import SearchableSelect from './SearchableSelect'
import { listAppUsers } from '../data/queries/appUsers'
import { listEmployees } from '../data/queries/employees'
import { supabase } from '../lib/supabaseClient'
import { editedLabel } from '../utils/stockEdit'
import { dbErrorMessage } from '../utils/dbErrors'
import Banner from './Banner'

/**
 * Supervisor/admin edit of one existing Stores row. Only qty, date, remarks
 * and (RM Receipt) supplier are editable; `info` lists the read-only
 * identifying fields (doc no, type, PRD, material/part, stages).
 *
 * onSave(draft) returns an error string to show, or null when saved.
 */
export default function StockEditPanel({
  row,
  info,
  qtyLabel = 'Quantity',
  dateLabel = 'Transaction Date',
  showRemarks = true,
  supplierOptions,
  onSave,
  onCancel,
  qtyKey = 'qty',
  dateKey = 'transaction_date',
}) {
  const [draft, setDraft] = useState(() => draftFrom(row, qtyKey, dateKey))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDraft(draftFrom(row, qtyKey, dateKey))
    setError(null)
  }, [row, qtyKey, dateKey])

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const message = await onSave(draft)
      if (message) setError(message)
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormSection icon={Pencil} title="Edit Transaction" subtitle="Supervisor / admin correction -- recorded with who and when">
      {error && (
        <Banner tone="error" message={error} />
      )}
      {info.map((item) => (
        <Field key={item.label} label={item.label}>
          <AutoFillBox value={item.value} />
        </Field>
      ))}
      <Field label={qtyLabel} required>
        <TextInput type="number" value={draft.qty} onChange={set('qty')} />
      </Field>
      <Field label={dateLabel} required>
        <TextInput type="date" value={draft.transaction_date} onChange={set('transaction_date')} />
      </Field>
      {supplierOptions && (
        <Field label="Supplier">
          <SearchableSelect value={draft.supplier_id} onChange={set('supplier_id')} options={supplierOptions} />
        </Field>
      )}
      {showRemarks && (
        <Field label="Remarks" width="long">
          <TextInput value={draft.remarks} onChange={set('remarks')} placeholder="Reason for the correction" />
        </Field>
      )}
      <div className="flex basis-full items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-bmlhblue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
        >
          Cancel
        </button>
      </div>
    </FormSection>
  )
}

function draftFrom(row, qtyKey, dateKey) {
  return {
    qty: row?.[qtyKey] ?? '',
    transaction_date: row?.[dateKey] ?? '',
    remarks: row?.remarks ?? '',
    supplier_id: row?.supplier_id ?? '',
  }
}

/** App users with a display name, for "Edited by <name>" / "Verified by
 * <name>": employee_name from the linked Employee Master row
 * ("app users".employee_id), and the login email for the signed-in user.
 * Failure (e.g. RLS) just means the label falls back to a short user id. */
export function useAppUsers() {
  const [users, setUsers] = useState([])
  useEffect(() => {
    let active = true
    Promise.all([
      listAppUsers().catch(() => []),
      listEmployees().catch(() => []),
      supabase.auth.getUser().then((r) => r.data?.user ?? null).catch(() => null),
    ])
      .then(([rows, employees, me]) => {
        const enriched = (rows ?? []).map((u) => ({
          ...u,
          employee_name: employees.find((e) => e.employee_id === u.employee_id)?.employee_name ?? '',
          email: u.email ?? (me && me.id === u.user_id ? me.email : ''),
        }))
        if (me && !enriched.some((u) => u.user_id === me.id)) enriched.push({ user_id: me.id, email: me.email })
        if (active) setUsers(enriched)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return users
}

/** Adds `edited_label` (text, also used by Print/Excel) to each row. */
export function withEditedLabels(rows, appUsers) {
  return rows.map((r) => ({ ...r, edited_label: editedLabel(r, appUsers) }))
}

/** List column: "Edited" badge, who/when on hover. */
export const EDITED_COLUMN = {
  key: 'edited_label',
  label: 'Edited',
  render: (r) =>
    r.edited_label ? (
      <span
        title={r.edited_label}
        className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
      >
        Edited
      </span>
    ) : (
      ''
    ),
}
