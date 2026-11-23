// Cycle Time Master -- "Add Multiple Stages": one Part, then a grid of route
// steps saved in ONE insert (all or nothing). Same payload + row rules as the
// single form (utils/cycleTimeBulk.js) plus bulk-only duplicate + machine
// capability checks.
import { useEffect, useImperativeHandle, useState } from 'react'
import { ListPlus, Plus, Trash2, Info } from 'lucide-react'
import FormSection, { Field, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import Banner from '../../components/Banner'
import { productOptions } from '../../utils/productOptions'
import { machineOptionLabel } from '../../utils/machineLabel'
import { dbErrorMessage } from '../../utils/dbErrors'
import {
  BULK_START_ROWS, EMPTY_STAGE_ROW, STEP_TYPES, withType, bulkProblems, bulkPayloads, isBlankRow, rowFromDbError,
} from '../../utils/cycleTimeBulk'
import { createCycleTimes } from '../../data/queries/cycleTimes'
import { listAllMachineOperations } from '../../data/queries/machineOperations'

const freshRows = (n = BULK_START_ROWS) => Array.from({ length: n }, () => ({ ...EMPTY_STAGE_ROW }))
const cellClass = (bad) =>
  `w-full h-7 rounded border px-1.5 text-xs disabled:bg-gray-100 ${bad ? 'border-red-500 bg-red-50' : 'border-gray-300'}`

export default function CycleTimeBulkEntry({ apiRef, records, products, machines, jobWorkTypes, onSaved }) {
  const [part, setPart] = useState('')
  // Machine capability (bulk only): loaded when the panel opens; save refuses while it is missing
  const [machineOps, setMachineOps] = useState(null)
  const [opsError, setOpsError] = useState(null)
  useEffect(() => {
    let active = true
    listAllMachineOperations()
      .then((rows) => active && setMachineOps(rows ?? []))
      .catch((e) => active && setOpsError(e?.message ?? String(e)))
    return () => { active = false }
  }, [])
  const [rows, setRows] = useState(() => freshRows())
  const [problems, setProblems] = useState({})
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [saving, setSaving] = useState(false)
  const product = products.find((p) => p.part_serial_number === part)

  function clearMarks() {
    setProblems({})
    setError(null)
  }

  function setCell(i, key, value) {
    setProblems((p) => {
      if (!p[i]) return p
      const next = { ...p }
      delete next[i]
      return next
    })
    setRows((rs) => rs.map((r, j) => (j !== i ? r : key === 'type' ? withType(r, value) : { ...r, [key]: value })))
  }

  const addRow = () => setRows((rs) => [...rs, { ...EMPTY_STAGE_ROW }])
  function removeRow(i) {
    setProblems({})
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : freshRows(1)))
  }

  function reset() {
    setPart('')
    setRows(freshRows())
    clearMarks()
    setSuccess(null)
  }

  async function save() {
    setSuccess(null)
    if (!machineOps) {
      setError(opsError ? `Could not load Machine Operations (${opsError}) -- reload and try again.` : 'Still loading Machine Operations -- try again in a moment.')
      return
    }
    const result = bulkProblems(part, rows, records, machineOps)
    if (result.header) {
      setProblems({})
      setError(result.header)
      return
    }
    if (result.empty) {
      setProblems({})
      setError('Enter at least one stage.')
      return
    }
    const badKeys = Object.keys(result.rows)
    setProblems(result.rows)
    if (badKeys.length) {
      setError(badKeys.length === 1 ? `Row ${Number(badKeys[0]) + 1}: ${result.rows[badKeys[0]].message}` : `${badKeys.length} rows have problems -- fix them and save again.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payloads = bulkPayloads(part, rows)
      await createCycleTimes(payloads)
      setRows(freshRows())
      setSuccess(`${payloads.length} stage${payloads.length === 1 ? '' : 's'} saved for ${part}.`)
      await onSaved?.()
    } catch (e) {
      // nothing saved; typed rows stay. Name the row when the refusal identifies it.
      const message = dbErrorMessage(e)
      const i = rowFromDbError(e, rows)
      if (i === null) {
        setError(message)
      } else {
        const r = rows[i]
        setProblems({ [i]: { message, field: 'seq' } })
        setError(`Row ${i + 1} (Stage ${String(r.seq).trim()} – ${String(r.operation).trim()}): ${message}`)
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

  const machineOptions = machines.map((mc) => ({ value: mc.machine_id, label: machineOptionLabel(mc) }))

  return (
    <>
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} />}
      {success && <Banner tone="success" message={success} onClose={() => setSuccess(null)} />}
      <FormSection icon={ListPlus} title="1. Add Multiple Stages" subtitle="Choose the part once, then one row per route step" columns={3}>
        <Field label="Part Serial Number" required>
          <SearchableSelect value={part} onChange={(e) => { clearMarks(); setPart(e.target.value) }} options={productOptions(products)} />
        </Field>
        <Field label="Part Name"><AutoFillBox value={product?.part_name} /></Field>
        <Field label="Part Drawing Number"><AutoFillBox value={product?.part_drawing_reference_number} /></Field>
      </FormSection>

      <section className="rounded-lg border border-gray-200 bg-white p-3 space-y-2" aria-label="Stages">
        <h3 className="text-sm font-semibold text-[#1F3A5F]">2. Stages <span className="font-normal text-xs text-gray-500">(blank rows are ignored)</span></h3>
        <p className="flex items-center gap-1.5 text-xs text-slate-600" data-testid="bulk-stage-note">
          <Info size={13} /> Changes apply to new PRDs only; existing route cards keep their stages.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="p-1 w-8">#</th>
                <th className="p-1 w-20">Stage *</th>
                <th className="p-1">Operation *</th>
                <th className="p-1 w-32">Type *</th>
                <th className="p-1">Machine</th>
                <th className="p-1">Job Work</th>
                <th className="p-1 w-28">Cycle Time (min)</th>
                <th className="p-1 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const p = problems[i]
                const bad = (f) => p?.field === f
                const n = i + 1
                return [
                  <tr key={`r${i}`} data-testid={`stage-row-${n}`} data-invalid={p ? 'true' : undefined}>
                    <td className="p-1 text-gray-500">{n}</td>
                    <td className="p-1"><input aria-label={`Row ${n} Stage`} type="number" className={cellClass(bad('seq'))} value={row.seq} onChange={(e) => setCell(i, 'seq', e.target.value)} /></td>
                    <td className="p-1"><input aria-label={`Row ${n} Operation`} className={cellClass(bad('operation'))} value={row.operation} onChange={(e) => setCell(i, 'operation', e.target.value)} /></td>
                    <td className="p-1">
                      <select aria-label={`Row ${n} Type`} className={cellClass(bad('type'))} value={row.type} onChange={(e) => setCell(i, 'type', e.target.value)}>
                        <option value="">Select...</option>
                        {STEP_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <select aria-label={`Row ${n} Machine`} disabled={row.type !== 'Internal'} className={cellClass(bad('machine_id'))} value={row.machine_id} onChange={(e) => setCell(i, 'machine_id', e.target.value)}>
                        <option value="" />
                        {machineOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <select aria-label={`Row ${n} Job Work`} disabled={row.type !== 'Outsourced'} className={cellClass(bad('job_work_code'))} value={row.job_work_code} onChange={(e) => setCell(i, 'job_work_code', e.target.value)}>
                        <option value="" />
                        {jobWorkTypes.map((j) => <option key={j.job_work_code} value={j.job_work_code}>{j.job_work_code}</option>)}
                      </select>
                    </td>
                    <td className="p-1"><input aria-label={`Row ${n} Cycle Time`} type="number" className={cellClass(bad('cycle_time_min'))} value={row.cycle_time_min} onChange={(e) => setCell(i, 'cycle_time_min', e.target.value)} /></td>
                    <td className="p-1">
                      <button type="button" aria-label={`Remove row ${n}`} title="Remove row" onClick={() => removeRow(i)} className="p-1 text-gray-500 hover:text-red-600"><Trash2 size={14} /></button>
                    </td>
                  </tr>,
                  p && (
                    <tr key={`e${i}`}>
                      <td />
                      <td colSpan={7} className="px-1 pb-1 text-[11px] text-red-600" data-testid={`stage-row-error-${n}`}>{p.message}</td>
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
