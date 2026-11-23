// Employee Master -- "Personal details" (059, supervisor / admin only).
// Own Save (one upsert); never part of the Employee Master save, list or
// exports. PRIVACY: no console output, and no phone / address / Aadhaar
// value ever appears in an error or toast (fixed texts, utils/employeePrivate.js).
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import FormSection, { Field, TextInput } from '../../components/FormSection'
import Banner from '../../components/Banner'
import EmployeePhoto from './EmployeePhoto'
import { getEmployeePrivate, saveEmployeePrivate } from '../../data/queries/employeePrivate'
import { EMPTY_PRIVATE, AADHAAR_MASK, aadhaarInput, maskAadhaar, privateForm, privatePayload, privateErrorText } from '../../utils/employeePrivate'
import { aadhaarDigits, formatAadhaar } from '../../utils/aadhaar'

// aadhaarMode 'last4' (059) | 'full' (061: 12 digits, shown "1234 5678 9012"); last4Present = column still there.
export default function EmployeePrivateSection({ employeeId, number, photoOn = false, aadhaarMode = 'last4', last4Present = true }) {
  const full = aadhaarMode === 'full'
  const [form, setForm] = useState(EMPTY_PRIVATE)
  const [saved, setSaved] = useState(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [badField, setBadField] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    let active = true
    setForm(EMPTY_PRIVATE)
    setSaved(null)
    setEditing(false)
    setError(null)
    setBadField(null)
    setSuccess(null)
    if (!employeeId) return undefined
    setLoading(true)
    // before 061 the call is exactly as before; after it, 'full' + whether aadhaar_last4 still exists
    getEmployeePrivate(employeeId, full ? { withPhoto: photoOn, aadhaarMode: 'full', last4Present } : { withPhoto: photoOn })
      .then((row) => {
        if (!active) return
        setSaved(row)
        setForm(privateForm(row, aadhaarMode))
      })
      .catch((e) => active && setError(privateErrorText(e, 'load', { aadhaarMode })))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [employeeId, photoOn, aadhaarMode, last4Present, full])

  const set = (key) => (e) => {
    setBadField((f) => (f === key ? null : f))
    const v = e.target.value
    setForm((f) => ({ ...f, [key]: key === 'aadhaar_last4' ? aadhaarInput(v) : key === 'aadhaar_number' ? aadhaarDigits(v) : v }))
  }

  async function handleSave() {
    setSuccess(null)
    const { error: problem, field, payload } = privatePayload(employeeId, form, { aadhaarMode })
    if (problem) {
      setError(problem)
      setBadField(field)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const row = await saveEmployeePrivate(payload)
      setSaved(row)
      setForm(privateForm(row, aadhaarMode))
      setEditing(false)
      setSuccess(`Personal details saved for ${employeeId}.`)
    } catch (e) {
      setError(privateErrorText(e, 'save', { aadhaarMode })) // fixed text only; typed values stay in the form
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setForm(privateForm(saved, aadhaarMode))
    setEditing(false)
    setError(null)
    setBadField(null)
  }

  const title = `${number}. Personal details`
  if (!employeeId) {
    return (
      <FormSection icon={ShieldCheck} title={title} subtitle="Supervisor / admin only" columns={1}>
        <p className="text-xs text-slate-500" data-testid="private-save-first">Save the employee first, then add personal details.</p>
      </FormSection>
    )
  }

  const readOnly = !editing
  const inputProps = (key) => ({ value: form[key], onChange: set(key), disabled: readOnly || saving, 'data-invalid': badField === key || undefined })

  return (
    <>
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} />}
      {success && <Banner tone="success" message={success} onClose={() => setSuccess(null)} />}
      <FormSection icon={ShieldCheck} title={title} subtitle="Supervisor / admin only · not included in exports" columns={3}>
        {photoOn && !loading && (
          <div className="col-span-full">
            <EmployeePhoto
              employeeId={employeeId}
              path={saved?.photo_path ?? null}
              onChange={(p) => setSaved((s) => ({ ...(s ?? { employee_id: employeeId }), photo_path: p }))}
            />
          </div>
        )}
        <Field label="Phone 1"><TextInput aria-label="Phone 1" {...inputProps('phone_1')} /></Field>
        <Field label="Phone 2 (alternate / emergency)"><TextInput aria-label="Phone 2" {...inputProps('phone_2')} /></Field>
        {full ? (
          <Field label="Aadhaar number">
            {readOnly ? (
              <TextInput aria-label="Aadhaar" value={formatAadhaar(saved?.aadhaar_number)} disabled readOnly />
            ) : (
              <TextInput
                aria-label="Aadhaar number"
                inputMode="numeric"
                autoComplete="off"
                placeholder="1234 5678 9012"
                maxLength={14}
                {...inputProps('aadhaar_number')}
                value={formatAadhaar(form.aadhaar_number)}
              />
            )}
          </Field>
        ) : (
        <Field label="Aadhaar last 4 digits">
          {readOnly ? (
            <TextInput aria-label="Aadhaar" value={maskAadhaar(saved?.aadhaar_last4)} disabled readOnly />
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 whitespace-nowrap">{AADHAAR_MASK}</span>
              <TextInput aria-label="Aadhaar last 4" inputMode="numeric" maxLength={4} autoComplete="off" {...inputProps('aadhaar_last4')} />
            </span>
          )}
        </Field>
        )}
        <Field label="Address" width="long"><TextInput aria-label="Address" {...inputProps('address')} /></Field>
        <div className="flex items-end gap-2">
          {editing ? (
            <>
              <button type="button" onClick={handleSave} disabled={saving} className="h-8 rounded bg-[#1F3A5F] px-3 text-xs text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save personal details'}
              </button>
              <button type="button" onClick={handleCancel} disabled={saving} className="h-8 rounded border border-gray-300 px-3 text-xs">Cancel</button>
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)} disabled={loading} className="h-8 rounded border border-gray-300 px-3 text-xs text-[#1F3A5F] disabled:opacity-50">
              {loading ? 'Loading…' : 'Edit personal details'}
            </button>
          )}
        </div>
      </FormSection>
    </>
  )
}
