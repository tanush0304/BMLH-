import { useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import FormSection, { Field, TextInput } from '../../components/FormSection'
import Banner from '../../components/Banner'
import { FieldErrorProvider, useFieldError } from '../../components/FieldError'
import {
  deliveryAddressesSupported,
  listDeliveryAddresses,
  createDeliveryAddress,
  updateDeliveryAddress,
} from '../../data/queries/deliveryAddresses'
import {
  EMPTY_DELIVERY_ADDRESS,
  addressesForCustomer,
  deliveryAddressPayload,
  deliveryAddressProblem,
} from '../../utils/deliveryAddress'
import { dbErrorMessage } from '../../utils/dbErrors'

// Customer Master section "Delivery Addresses" (042): many per customer,
// one default, Deactivate instead of Delete. Hidden before 042 is run.
// Has its own Save -- the master's toolbar Save never touches it.
// sectionNumber: its position after the master's own sections (badge number).
export default function DeliveryAddressesSection({ customerId, mode, sectionNumber }) {
  const [supported, setSupported] = useState(false)
  const [all, setAll] = useState([])
  const [editing, setEditing] = useState(null) // null | { id?: number, ...form }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const fieldError = useFieldError(error, setError)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const ok = await deliveryAddressesSupported()
        if (!active) return
        setSupported(ok)
        if (ok) {
          const rows = await listDeliveryAddresses()
          if (active) setAll(rows)
        }
      } catch (e) {
        if (active) setError(dbErrorMessage(e, 'Could not load delivery addresses.'))
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setEditing(null)
    setError(null)
  }, [customerId])

  if (!supported) return null

  const saved = mode !== 'new' && !!customerId
  const rows = saved ? addressesForCustomer(all, customerId) : []

  async function reload() {
    setAll(await listDeliveryAddresses())
  }

  function startAdd() {
    setNotice(null)
    setError(null)
    setEditing({ ...EMPTY_DELIVERY_ADDRESS, is_default: rows.every((r) => !r.is_default || !r.is_active) })
  }

  function startEdit(row) {
    setNotice(null)
    setError(null)
    const form = { id: row.id }
    for (const k of Object.keys(EMPTY_DELIVERY_ADDRESS)) form[k] = row[k] ?? EMPTY_DELIVERY_ADDRESS[k]
    setEditing(form)
  }

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setEditing((f) => ({ ...f, [key]: value, ...(key === 'is_active' && !value ? { is_default: false } : {}) }))
  }

  async function save() {
    if (saving || !editing) return
    const others = rows.filter((r) => r.id !== editing.id)
    const problem = deliveryAddressProblem(editing, others)
    if (problem) {
      fieldError.fail(`addr.${problem.field}`, problem.error)
      return
    }
    const payload = deliveryAddressPayload(editing, customerId)
    setSaving(true)
    setError(null)
    try {
      // one default per customer (partial unique index): clear the old one first
      if (payload.is_default) {
        for (const r of others.filter((o) => o.is_default)) await updateDeliveryAddress(r.id, { is_default: false })
      }
      const row = editing.id ? await updateDeliveryAddress(editing.id, payload) : await createDeliveryAddress(payload)
      setEditing(null)
      setNotice(`${row.label} saved.`)
      await reload()
    } catch (e) {
      setError(dbErrorMessage(e))
      await reload().catch(() => {})
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await updateDeliveryAddress(row.id, row.is_active ? { is_active: false, is_default: false } : { is_active: true })
      setNotice(`${row.label} ${row.is_active ? 'deactivated' : 'activated'}.`)
      await reload()
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FieldErrorProvider value={fieldError}>
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} onClose={() => setNotice(null)} />}
      <FormSection icon={Truck} title={sectionNumber ? `${sectionNumber}. Delivery Addresses` : 'Delivery Addresses'} subtitle="Where goods are shipped -- one is picked per PO line (Deliver To)" columns={1}>
        <div className="basis-full w-full space-y-2" data-testid="delivery-addresses">
          {!saved ? (
            <p className="text-xs text-gray-500">Save the customer first, then add its delivery addresses here.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#1F3A5F] text-white text-left">
                      {['Label', 'Address', 'City', 'State', 'Pincode', 'Country', 'GSTIN', 'Default', 'Active', ''].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-2 py-2 text-gray-500">No delivery addresses yet.</td>
                      </tr>
                    )}
                    {rows.map((r) => (
                      <tr key={r.id} className={`border-b ${r.is_active ? '' : 'text-gray-400'}`}>
                        <td className="px-2 py-1.5 font-medium">{r.label}</td>
                        <td className="px-2 py-1.5 max-w-[260px] truncate" title={r.address ?? ''}>{r.address}</td>
                        <td className="px-2 py-1.5">{r.city}</td>
                        <td className="px-2 py-1.5">{r.state}</td>
                        <td className="px-2 py-1.5">{r.pincode}</td>
                        <td className="px-2 py-1.5">{r.country}</td>
                        <td className="px-2 py-1.5">{r.gstin}</td>
                        <td className="px-2 py-1.5">{r.is_default ? 'Yes' : ''}</td>
                        <td className="px-2 py-1.5">{r.is_active ? 'Yes' : 'No'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">
                          <button type="button" className="text-bmlhblue hover:underline mr-3" onClick={() => startEdit(r)} disabled={saving}>
                            Edit
                          </button>
                          <button type="button" className="text-bmlhblue hover:underline" onClick={() => toggleActive(r)} disabled={saving}>
                            {r.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editing ? (
                <div className="rounded border border-gray-200 bg-gray-50 p-2 space-y-2">
                  <div className="flex flex-wrap gap-3">
                    <Field name="addr.label" label="Label" required width="medium">
                      <TextInput value={editing.label} onChange={set('label')} placeholder="e.g. Plant 1 - Hosur" />
                    </Field>
                    <Field name="addr.address" label="Address" width="long">
                      <TextInput value={editing.address ?? ''} onChange={set('address')} />
                    </Field>
                    <Field name="addr.city" label="City" width="short">
                      <TextInput value={editing.city ?? ''} onChange={set('city')} />
                    </Field>
                    <Field name="addr.state" label="State" width="short">
                      <TextInput value={editing.state ?? ''} onChange={set('state')} />
                    </Field>
                    <Field name="addr.pincode" label="Pincode" width="short">
                      <TextInput value={editing.pincode ?? ''} onChange={set('pincode')} inputMode="numeric" />
                    </Field>
                    <Field name="addr.country" label="Country" width="short">
                      <TextInput value={editing.country ?? ''} onChange={set('country')} />
                    </Field>
                    <Field name="addr.gstin" label="GSTIN" width="medium">
                      <TextInput value={editing.gstin ?? ''} onChange={set('gstin')} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs" data-field="addr.is_default">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!editing.is_default} onChange={set('is_default')} disabled={!editing.is_active} />
                      Default
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={editing.is_active !== false} onChange={set('is_active')} />
                      Active
                    </label>
                    <div className="ml-auto flex gap-2">
                      <button type="button" className="rounded border px-3 py-1.5" onClick={() => setEditing(null)} disabled={saving}>
                        Cancel
                      </button>
                      <button type="button" className="rounded bg-bmlhblue px-3 py-1.5 text-white disabled:opacity-60" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Address'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button type="button" className="rounded border border-bmlhblue px-3 py-1.5 text-xs text-bmlhblue hover:bg-blue-50" onClick={startAdd}>
                  + Add delivery address
                </button>
              )}
            </>
          )}
        </div>
      </FormSection>
    </FieldErrorProvider>
  )
}
