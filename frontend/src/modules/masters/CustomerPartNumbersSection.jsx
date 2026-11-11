import { useEffect, useMemo, useState } from 'react'
import { Hash } from 'lucide-react'
import FormSection, { Field, TextInput } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import Banner from '../../components/Banner'
import { FieldErrorProvider, useFieldError } from '../../components/FieldError'
import {
  customerPartNumbersSupported,
  listCustomerPartNumbers,
  createCustomerPartNumber,
  updateCustomerPartNumber,
} from '../../data/queries/customerPartNumbers'
import { listProducts } from '../../data/queries/products'
import { productOptions } from '../../utils/productOptions'
import {
  EMPTY_CUSTOMER_PART,
  customerPartNumberPayload,
  customerPartNumberProblem,
  partNumbersForCustomer,
} from '../../utils/customerPartNumber'
import { dbErrorMessage } from '../../utils/dbErrors'

// Customer Master section "Customer Part Numbers" (045): the customer's own
// part number / name / drawing ref / revision for each of OUR parts. One
// active row per part; Deactivate instead of Delete. Hidden before 045.
// Own Save -- the master's toolbar Save never touches it.
export default function CustomerPartNumbersSection({ customerId, mode, sectionNumber }) {
  const [supported, setSupported] = useState(false)
  const [all, setAll] = useState([])
  const [products, setProducts] = useState([])
  const [editing, setEditing] = useState(null) // null | { id?: number, ...form }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const fieldError = useFieldError(error, setError)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const ok = await customerPartNumbersSupported()
        if (!active) return
        setSupported(ok)
        if (ok) {
          const [rows, prods] = await Promise.all([listCustomerPartNumbers(), listProducts()])
          if (active) {
            setAll(rows)
            setProducts(prods)
          }
        }
      } catch (e) {
        if (active) setError(dbErrorMessage(e, 'Could not load customer part numbers.'))
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

  const partName = useMemo(() => new Map(products.map((p) => [p.part_serial_number, p.part_name])), [products])

  if (!supported) return null

  const saved = mode !== 'new' && !!customerId
  const rows = saved ? partNumbersForCustomer(all, customerId) : []

  async function reload() {
    setAll(await listCustomerPartNumbers())
  }

  function startAdd() {
    setNotice(null)
    setError(null)
    setEditing({ ...EMPTY_CUSTOMER_PART })
  }

  function startEdit(row) {
    setNotice(null)
    setError(null)
    const form = { id: row.id }
    for (const k of Object.keys(EMPTY_CUSTOMER_PART)) form[k] = row[k] ?? EMPTY_CUSTOMER_PART[k]
    setEditing(form)
  }

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setEditing((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    if (saving || !editing) return
    const others = rows.filter((r) => r.id !== editing.id)
    const problem = customerPartNumberProblem(editing, others)
    if (problem) {
      fieldError.fail(`cpn.${problem.field}`, problem.error)
      return
    }
    const payload = customerPartNumberPayload(editing, customerId)
    // customer + part are fixed after insert (045 guard)
    if (editing.id) {
      delete payload.customer_id
      delete payload.part_serial_number
    }
    setSaving(true)
    setError(null)
    try {
      const row = editing.id
        ? await updateCustomerPartNumber(editing.id, payload)
        : await createCustomerPartNumber(payload)
      setEditing(null)
      setNotice(`${row.customer_part_number} saved.`)
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
    if (!row.is_active) {
      const problem = customerPartNumberProblem({ ...row, is_active: true }, rows.filter((r) => r.id !== row.id))
      if (problem) {
        setError(problem.error)
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      await updateCustomerPartNumber(row.id, { is_active: !row.is_active })
      setNotice(`${row.customer_part_number} ${row.is_active ? 'deactivated' : 'activated'}.`)
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
      <FormSection
        icon={Hash}
        title={sectionNumber ? `${sectionNumber}. Customer Part Numbers` : 'Customer Part Numbers'}
        subtitle="The customer's own part number and drawing for each of our parts"
        columns={1}
      >
        <div className="basis-full w-full space-y-2" data-testid="customer-part-numbers">
          {!saved ? (
            <p className="text-xs text-gray-500">Save the customer first, then add its part numbers here.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#1F3A5F] text-white text-left">
                      {['Our Part', 'Part Name', 'Customer Part No', 'Customer Part Name', 'Customer Drawing Ref', 'Revision', 'Active', ''].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-2 py-2 text-gray-500">No customer part numbers yet.</td>
                      </tr>
                    )}
                    {rows.map((r) => (
                      <tr key={r.id} className={`border-b ${r.is_active ? '' : 'text-gray-400'}`}>
                        <td className="px-2 py-1.5 font-medium">{r.part_serial_number}</td>
                        <td className="px-2 py-1.5">{partName.get(r.part_serial_number) ?? ''}</td>
                        <td className="px-2 py-1.5 font-medium">{r.customer_part_number}</td>
                        <td className="px-2 py-1.5">{r.customer_part_name}</td>
                        <td className="px-2 py-1.5">{r.customer_drawing_ref}</td>
                        <td className="px-2 py-1.5">{r.revision}</td>
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
                    <Field name="cpn.part_serial_number" label="Our Part" required width="medium">
                      <SearchableSelect
                        aria-label="Our Part"
                        value={editing.part_serial_number}
                        onChange={set('part_serial_number')}
                        disabled={!!editing.id}
                        options={productOptions(products)}
                      />
                    </Field>
                    <Field name="cpn.customer_part_number" label="Customer Part No" required width="medium">
                      <TextInput value={editing.customer_part_number} onChange={set('customer_part_number')} />
                    </Field>
                    <Field name="cpn.customer_part_name" label="Customer Part Name" width="long">
                      <TextInput value={editing.customer_part_name ?? ''} onChange={set('customer_part_name')} />
                    </Field>
                    <Field name="cpn.customer_drawing_ref" label="Customer Drawing Ref" width="medium">
                      <TextInput value={editing.customer_drawing_ref ?? ''} onChange={set('customer_drawing_ref')} />
                    </Field>
                    <Field name="cpn.revision" label="Revision" width="short">
                      <TextInput value={editing.revision ?? ''} onChange={set('revision')} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={editing.is_active !== false} onChange={set('is_active')} />
                      Active
                    </label>
                    {editing.id && <span className="text-gray-500">Our Part can't be changed -- deactivate this row and add a new one.</span>}
                    <div className="ml-auto flex gap-2">
                      <button type="button" className="rounded border px-3 py-1.5" onClick={() => setEditing(null)} disabled={saving}>
                        Cancel
                      </button>
                      <button type="button" className="rounded bg-bmlhblue px-3 py-1.5 text-white disabled:opacity-60" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Part Number'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button type="button" className="rounded border border-bmlhblue px-3 py-1.5 text-xs text-bmlhblue hover:bg-blue-50" onClick={startAdd}>
                  + Add customer part number
                </button>
              )}
            </>
          )}
        </div>
      </FormSection>
    </FieldErrorProvider>
  )
}
