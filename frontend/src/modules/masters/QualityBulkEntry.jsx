// Quality Master -- "Add Multiple Parameters": one Part + Applies To + target +
// Type of Operation, then a grid of parameters saved in ONE insert (all or
// nothing). Same payload + rules as the single form (utils/qualityBulk.js).
import { useEffect, useImperativeHandle, useState } from 'react'
import { ListPlus, Plus, Trash2 } from 'lucide-react'
import FormSection, { Field, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import Banner from '../../components/Banner'
import { productOptions } from '../../utils/productOptions'
import { machineOptionLabel } from '../../utils/machineLabel'
import { categoryOptions, operationsForTarget, operationsForJobWork } from '../../utils/qualityMatch'
import {
  BULK_START_ROWS, EMPTY_BULK_ROW, targetMode, rowIsGauge, bulkProblems, bulkPayloads,
  isBlankRow, rowFromDbError,
} from '../../utils/qualityBulk'
import { dbErrorMessage } from '../../utils/dbErrors'
import { createQualityParameters } from '../../data/queries/qualityParameters'

const freshRows = (n = BULK_START_ROWS) => Array.from({ length: n }, () => ({ ...EMPTY_BULK_ROW }))
const EMPTY_TARGET = { part_serial_number: '', applies_to: 'category', machine_id: '', machine_category: '', job_work_code: '', type_of_operation: '' }

const cellClass = (bad) =>
  `w-full h-7 rounded border px-1.5 text-xs disabled:bg-gray-100 ${bad ? 'border-red-500 bg-red-50' : 'border-gray-300'}`

export default function QualityBulkEntry({ apiRef, records, products, machines, cycleTimes, jobWorkTypes, flags, onSaved }) {
  const [target, setTarget] = useState(EMPTY_TARGET)
  const [rows, setRows] = useState(() => freshRows())
  const [problems, setProblems] = useState({})
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [saving, setSaving] = useState(false)

  const { byJobWork, byCategory } = targetMode(target, flags)
  const product = products.find((p) => p.part_serial_number === target.part_serial_number)
  const operations = byJobWork
    ? operationsForJobWork({ cycleTimes, partSerialNumber: target.part_serial_number, jobWorkCode: target.job_work_code })
    : operationsForTarget({
      cycleTimes, machines, partSerialNumber: target.part_serial_number,
      machineId: byCategory ? '' : target.machine_id,
      category: byCategory ? target.machine_category : '',
    })

  function clearMarks() {
    setProblems({})
    setError(null)
  }

  function setTargetField(key, value) {
    clearMarks()
    setTarget((t) => ({ ...t, [key]: value, ...(key === 'type_of_operation' ? {} : { type_of_operation: '' }) }))
  }

  function handleAppliesTo(value) {
    clearMarks()
    const wasJobWork = target.applies_to === 'jobwork'
    setTarget((t) => ({ ...t, applies_to: value, machine_id: '', machine_category: '', job_work_code: '', type_of_operation: '' }))
    // Job Work = always Gauge (056); leaving Job Work brings rows back to Measured
    if (value === 'jobwork') {
      setRows((rs) => rs.map((r) => ({ ...r, check_type: 'Gauge', standard: '', upper_tolerance: '', lower_tolerance: '' })))
    } else if (wasJobWork) {
      setRows((rs) => rs.map((r) => ({ ...r, check_type: 'Measured', gauge_standard: '' })))
    }
  }

  function setCell(i, key, value) {
    setProblems((p) => {
      if (!p[i]) return p
      const next = { ...p }
      delete next[i]
      return next
    })
    setRows((rs) => rs.map((r, j) => {
      if (j !== i) return r
      const next = { ...r, [key]: value }
      if (key === 'check_type' && value === 'Gauge') Object.assign(next, { standard: '', upper_tolerance: '', lower_tolerance: '' })
      if (key === 'check_type' && value === 'Measured') next.gauge_standard = ''
      return next
    }))
  }

  const addRow = () => setRows((rs) => [...rs, { ...EMPTY_BULK_ROW, check_type: byJobWork ? 'Gauge' : 'Measured' }])
  function removeRow(i) {
    setProblems({})
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : freshRows(1)))
  }

  function reset() {
    setTarget(EMPTY_TARGET)
    setRows(freshRows())
    clearMarks()
    setSuccess(null)
  }

  async function save() {
    setSuccess(null)
    const result = bulkProblems(target, rows, records, flags)
    if (result.header) {
      setProblems({})
      setError(result.header)
      return
    }
    if (result.empty) {
      setProblems({})
      setError('Enter at least one parameter.')
      return
    }
    const bad = Object.keys(result.rows).length
    setProblems(result.rows)
    if (bad) {
      setError(bad === 1 ? `Row ${Number(Object.keys(result.rows)[0]) + 1}: ${Object.values(result.rows)[0].message}` : `${bad} rows have problems -- fix them and save again.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payloads = bulkPayloads(target, rows, flags)
      await createQualityParameters(payloads)
      const where = `${target.part_serial_number} – ${target.type_of_operation}`
      setRows(freshRows())
      setSuccess(`${payloads.length} parameter${payloads.length === 1 ? '' : 's'} saved for ${where}.`)
      await onSaved?.()
    } catch (e) {
      // nothing saved; typed rows stay. Name the row when the refusal identifies it.
      const message = dbErrorMessage(e)
      const i = rowFromDbError(e, rows)
      if (i === null) {
        setError(message)
      } else {
        setProblems({ [i]: { message, field: 'quality_parameter' } })
        setError(`Row ${i + 1} (${String(rows[i].quality_parameter).trim()}): ${message}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const dirty = rows.some((r) => !isBlankRow(r))
  useImperativeHandle(apiRef, () => ({ save, reset, saving, isDirty: () => dirty }))

  // Closing / reloading the tab with typed rows: the browser's own "leave site?" prompt.
  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const showCheckType = flags.checkTypeOn && !byJobWork
  const anyMeasured = !byJobWork && rows.some((r) => !rowIsGauge(r, target, flags))
  const showTextStandard = byJobWork || (flags.gaugeStandardOn && rows.some((r) => rowIsGauge(r, target, flags)))
  const showInstrument = flags.checkTypeOn || byJobWork

  return (
    <>
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} />}
      {success && <Banner tone="success" message={success} onClose={() => setSuccess(null)} />}
      <FormSection icon={ListPlus} title="1. Add Multiple Parameters" subtitle="Choose the part, target and operation once, then one row per parameter" columns={3}>
        <Field label="Part Serial Number" required>
          <SearchableSelect value={target.part_serial_number} onChange={(e) => setTargetField('part_serial_number', e.target.value)} options={productOptions(products)} />
        </Field>
        <Field label="Part Name"><AutoFillBox value={product?.part_name} /></Field>
        <Field label="Part Drawing Number"><AutoFillBox value={product?.part_drawing_reference_number} /></Field>
        {flags.categoryOn && (
          <Field label="Applies To" required>
            <div className="flex items-center gap-4 h-8 text-xs" role="radiogroup" aria-label="Applies To">
              {[['category', 'Machine Category'], ['machine', 'Specific Machine'], ...(flags.jobWorkOn ? [['jobwork', 'Job Work']] : [])].map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-1.5">
                  <input type="radio" name="qm-bulk-applies-to" value={value} checked={target.applies_to === value} onChange={() => handleAppliesTo(value)} />
                  {label}
                </label>
              ))}
            </div>
          </Field>
        )}
        {byJobWork ? (
          <Field label="Job Work" required>
            <SearchableSelect value={target.job_work_code} onChange={(e) => setTargetField('job_work_code', e.target.value)}
              options={jobWorkTypes.map((j) => ({ value: j.job_work_code, label: `${j.type_of_job_work} (${j.job_work_code})` }))} />
          </Field>
        ) : byCategory ? (
          <Field label="Machine Category" required>
            <SearchableSelect value={target.machine_category} onChange={(e) => setTargetField('machine_category', e.target.value)} options={categoryOptions(machines)} />
          </Field>
        ) : (
          <Field label="Machine" required>
            <SearchableSelect value={target.machine_id} onChange={(e) => setTargetField('machine_id', e.target.value)}
              options={machines.map((mc) => ({ value: mc.machine_id, label: machineOptionLabel(mc) }))} />
          </Field>
        )}
        <Field label="Type of Operation" required>
          <SearchableSelect value={target.type_of_operation} onChange={(e) => setTargetField('type_of_operation', e.target.value)} disabled={operations.length === 0} options={operations} />
        </Field>
      </FormSection>

      <section className="rounded-lg border border-gray-200 bg-white p-3 space-y-2" aria-label="Parameters">
        <h3 className="text-sm font-semibold text-[#1F3A5F]">2. Parameters <span className="font-normal text-xs text-gray-500">(blank rows are ignored)</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="p-1 w-8">#</th>
                <th className="p-1">Parameter *</th>
                {showCheckType && <th className="p-1">Check Type</th>}
                {(anyMeasured || showTextStandard) && <th className="p-1">Standard</th>}
                {anyMeasured && <th className="p-1">Upper Tol</th>}
                {anyMeasured && <th className="p-1">Lower Tol</th>}
                {showInstrument && <th className="p-1">Instrument</th>}
                <th className="p-1">Remarks</th>
                <th className="p-1 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const gauge = rowIsGauge(row, target, flags)
                const p = problems[i]
                const bad = (field) => p?.field === field
                const n = i + 1
                return [
                  <tr key={`r${i}`} data-testid={`bulk-row-${n}`} data-invalid={p ? 'true' : undefined}>
                    <td className="p-1 text-gray-500">{n}</td>
                    <td className="p-1"><input aria-label={`Row ${n} Parameter`} className={cellClass(bad('quality_parameter'))} value={row.quality_parameter} onChange={(e) => setCell(i, 'quality_parameter', e.target.value)} /></td>
                    {showCheckType && (
                      <td className="p-1">
                        <select aria-label={`Row ${n} Check Type`} className={cellClass(false)} value={row.check_type} onChange={(e) => setCell(i, 'check_type', e.target.value)}>
                          <option>Measured</option>
                          <option>Gauge</option>
                        </select>
                      </td>
                    )}
                    {(anyMeasured || showTextStandard) && (
                      <td className="p-1">
                        {gauge
                          ? (byJobWork || flags.gaugeStandardOn
                            ? <input aria-label={`Row ${n} Standard`} className={cellClass(false)} placeholder="e.g. M8x1.25 6H" value={row.gauge_standard} onChange={(e) => setCell(i, 'gauge_standard', e.target.value)} />
                            : null)
                          : <input aria-label={`Row ${n} Standard`} type="number" className={cellClass(bad('standard'))} value={row.standard} onChange={(e) => setCell(i, 'standard', e.target.value)} />}
                      </td>
                    )}
                    {anyMeasured && (
                      <td className="p-1"><input aria-label={`Row ${n} Upper Tol`} type="number" disabled={gauge} className={cellClass(bad('upper_tolerance'))} value={row.upper_tolerance} onChange={(e) => setCell(i, 'upper_tolerance', e.target.value)} /></td>
                    )}
                    {anyMeasured && (
                      <td className="p-1"><input aria-label={`Row ${n} Lower Tol`} type="number" disabled={gauge} className={cellClass(bad('lower_tolerance'))} value={row.lower_tolerance} onChange={(e) => setCell(i, 'lower_tolerance', e.target.value)} /></td>
                    )}
                    {showInstrument && (
                      <td className="p-1"><input aria-label={`Row ${n} Instrument`} className={cellClass(false)} value={row.gauge_ref} onChange={(e) => setCell(i, 'gauge_ref', e.target.value)} /></td>
                    )}
                    <td className="p-1"><input aria-label={`Row ${n} Remarks`} className={cellClass(false)} value={row.remarks} onChange={(e) => setCell(i, 'remarks', e.target.value)} /></td>
                    <td className="p-1">
                      <button type="button" aria-label={`Remove row ${n}`} title="Remove row" onClick={() => removeRow(i)} className="p-1 text-gray-500 hover:text-red-600"><Trash2 size={14} /></button>
                    </td>
                  </tr>,
                  p && (
                    <tr key={`e${i}`}>
                      <td />
                      <td colSpan={8} className="px-1 pb-1 text-[11px] text-red-600" data-testid={`bulk-row-error-${n}`}>{p.message}</td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1 h-7 rounded border border-gray-300 px-2 text-xs">
          <Plus size={13} /> Add row
        </button>
        {saving && <span className="ml-2 text-xs text-gray-500">Saving…</span>}
      </section>
    </>
  )
}
