import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ShieldCheck, ListPlus, ArrowLeft } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, AutoFillBox, SelectInput } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import { productOptions } from '../../utils/productOptions'
import RecordsList from '../../components/RecordsList'
import {
  listQualityParameters,
  createQualityParameter,
  updateQualityParameter,
  deleteQualityParameter,
  qualityCategorySupported,
  qualityCheckTypeSupported,
  qualityGaugeStandardSupported,
  parameterHasReadings,
} from '../../data/queries/qualityParameters'
import { categoryOptions, operationsForTarget, operationsForJobWork, appliesToLabel, isCategoryRow, isJobWorkRow } from '../../utils/qualityMatch'
import { buildPayload, duplicateParameter } from '../../utils/qualityBulk'
import QualityBulkEntry from './QualityBulkEntry'
import { qualityReceiptSupported } from '../../data/queries/jobworkQc'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import { listCycleTimes } from '../../data/queries/cycleTimes'
import { listProducts } from '../../data/queries/products'
import { listMachines } from '../../data/queries/machines'
import { machineOptionLabel } from '../../utils/machineLabel'
import { validateNumber, NUMBER_RULES } from '../../utils/numericFields'
import { standardText } from '../../utils/qualityResult'
import Banner from '../../components/Banner'
import ConfirmDialog, { useDeleteConfirm, recordLabel } from '../../components/ConfirmDialog'

const EMPTY_FORM = {
  id: '',
  part_serial_number: '',
  applies_to: 'category', // 'category' | 'machine' (044; before it always 'machine') | 'jobwork' (054)
  machine_category: '',
  machine_id: '',
  job_work_code: '', // 054: Job Work row = part + job_work_code
  type_of_operation: '',
  quality_parameter: '',
  standard: '',
  upper_tolerance: '',
  lower_tolerance: '',
  expected_text_value: '',
  remarks: '',
  check_type: 'Measured', // 048
  gauge_ref: '', // 048
  gauge_standard: '', // 053
}

const LIST_COLUMNS = [
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'part_drawing_reference_number', label: 'Part Drawing Number' },
  { key: 'machine_label', label: 'Applies To' },
  { key: 'type_of_operation', label: 'Type of Operation' },
  { key: 'quality_parameter', label: 'Quality Parameter' },
  { key: 'check_type', label: 'Check Type', needsCheckType: true },
  { key: 'gauge_ref', label: 'Instrument', needsCheckType: true }, // gauge_ref: Measured + Gauge
  { key: 'standard_text', label: 'Standard' }, // Measured: number; Gauge: text spec (053)
  { key: 'upper_tolerance', label: 'Upper Tolerance' },
  { key: 'lower_tolerance', label: 'Lower Tolerance' },
  { key: 'unit_of_measurement', label: 'UoM' },
  { key: 'remarks', label: 'Remarks' },
]

// Moved to utils/qualityBulk.js (shared with bulk entry); re-exported for existing imports.
export { duplicateParameter }

function inputValue(value) {
  return value ?? ''
}

export default function QualityMaster() {
  const [records, setRecords] = useState([])
  const del = useDeleteConfirm()
  const [products, setProducts] = useState([])
  const [machines, setMachines] = useState([])
  const [cycleTimes, setCycleTimes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [bulk, setBulk] = useState(false) // "Add Multiple Parameters" open
  const bulkApi = useRef(null)
  const [pendingLeave, setPendingLeave] = useState(null) // action waiting for "Discard"
  // 044 run? null = not known yet (treated as "no": the old form).
  const [categoryOn, setCategoryOn] = useState(null)
  const [checkTypeOn, setCheckTypeOn] = useState(false) // 048: Check Type (Measured / Gauge)
  const [gaugeStandardOn, setGaugeStandardOn] = useState(false) // 053: text Standard for Gauge
  // 048: Check Type is fixed once the parameter has readings (DB guard too)
  const [hasReadings, setHasReadings] = useState(false)
  useEffect(() => {
    let active = true
    setHasReadings(false)
    if (!checkTypeOn || !form.id) return undefined
    parameterHasReadings(form.id)
      .then((yes) => active && setHasReadings(!!yes))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [checkTypeOn, form.id])
  const listColumns = LIST_COLUMNS.filter((c) => !c.needsCheckType || checkTypeOn)
  const [jobWorkOn, setJobWorkOn] = useState(false) // 054: Applies To "Job Work"
  const [jobWorkTypes, setJobWorkTypes] = useState([])
  const byJobWork = jobWorkOn && form.applies_to === 'jobwork'
  // Job Work parameters are always OK / Not OK (Gauge; 056 DB check): no Check Type choice.
  const isGauge = byJobWork || (checkTypeOn && form.check_type === 'Gauge')
  const byCategory = !!categoryOn && form.applies_to === 'category'

  useEffect(() => {
    let active = true
    qualityReceiptSupported().then((ok) => { if (active) setJobWorkOn(!!ok) }).catch(() => {})
    listJobWorkTypes().then((rows) => { if (active) setJobWorkTypes(rows ?? []) }).catch(() => {})
    qualityCategorySupported().then((ok) => { if (active) setCategoryOn(ok) })
    qualityCheckTypeSupported().then((ok) => { if (active) setCheckTypeOn(!!ok) }).catch(() => {})
    qualityGaugeStandardSupported().then((ok) => { if (active) setGaugeStandardOn(!!ok) }).catch(() => {})
    return () => { active = false }
  }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [params, prods, machs, routes] = await Promise.all([
        listQualityParameters(),
        listProducts(),
        listMachines(),
        listCycleTimes(),
      ])
      setRecords(params)
      setProducts(prods)
      setMachines(machs)
      setCycleTimes(routes)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const selectedProduct = products.find((product) => product.part_serial_number === form.part_serial_number)
  const operations = byJobWork
    ? operationsForJobWork({ cycleTimes, partSerialNumber: form.part_serial_number, jobWorkCode: form.job_work_code })
    : operationsForTarget({
      cycleTimes,
      machines,
      partSerialNumber: form.part_serial_number,
      machineId: byCategory ? '' : form.machine_id,
      category: byCategory ? form.machine_category : '',
    })
  const categories = categoryOptions(machines)
  const parameterSuggestions = [...new Set(records.map((row) => row.quality_parameter).filter(Boolean))]
  const displayRecords = useMemo(() => records.map((row) => {
    const product = products.find((p) => p.part_serial_number === row.part_serial_number)
    return {
    ...row,
    standard_text: standardText(row) ?? '',
    part_name: product?.part_name ?? '',
    part_drawing_reference_number: product?.part_drawing_reference_number ?? '',
    unit_of_measurement: product?.unit_of_measurement ?? '',
    machine_label: appliesToLabel(row, (id) => {
      const m = machines.find((machine) => machine.machine_id === id)
      return m ? machineOptionLabel(m) : id
    }, (code) => jobWorkTypes.find((j) => j.job_work_code === code)?.type_of_job_work ?? code),
    }
  }), [records, products, machines, jobWorkTypes])

  function handleField(key) {
    return (e) => setForm((current) => ({ ...current, [key]: e.target.value }))
  }

  function handlePartChange(e) {
    setForm((current) => ({ ...current, part_serial_number: e.target.value, type_of_operation: '' }))
  }

  function handleMachineChange(e) {
    setForm((current) => ({ ...current, machine_id: e.target.value, type_of_operation: '' }))
  }

  function handleCategoryChange(e) {
    setForm((current) => ({ ...current, machine_category: e.target.value, type_of_operation: '' }))
  }

  function handleAppliesTo(value) {
    setForm((current) => ({ ...current, applies_to: value, machine_id: '', machine_category: '', job_work_code: '', type_of_operation: '',
      // Job Work = Gauge; leaving Job Work brings back the normal (Measured) fields
      ...(value === 'jobwork' ? { check_type: 'Gauge', standard: '', upper_tolerance: '', lower_tolerance: '' } : current.applies_to === 'jobwork' ? { check_type: 'Measured', gauge_standard: '' } : {}) }))
  }

  function handleJobWorkChange(e) {
    setForm((current) => ({ ...current, job_work_code: e.target.value, type_of_operation: '' }))
  }

  function openBulk() {
    handleNew()
    setBulk(true)
  }

  // Leaving "Add Multiple Parameters" with typed rows asks first.
  function guardLeave(action) {
    if (bulk && bulkApi.current?.isDirty()) setPendingLeave(() => action)
    else action()
  }

  function handleNew() {
    setBulk(false)
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    if (bulk) bulkApi.current?.reset()
    else handleNew()
  }

  function handleRowClick(row) {
    setBulk(false)
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ''])),
      applies_to: isJobWorkRow(row) ? 'jobwork' : isCategoryRow(row) ? 'category' : 'machine',
    })
    setMode('view')
    setSaveError(null)
  }

  function handleEdit() {
    if (!form.id) return
    setMode('edit')
  }

  async function handleSave() {
    const target = byJobWork ? form.job_work_code : byCategory ? form.machine_category.trim() : form.machine_id
    if (!form.part_serial_number || !target || !form.type_of_operation || !form.quality_parameter.trim()) {
      setSaveError(`Part Serial Number, ${byJobWork ? 'Job Work' : byCategory ? 'Machine Category' : 'Machine'}, Type of Operation and Quality Parameter are required.`)
      return
    }
    const duplicate = duplicateParameter(records, form, byCategory, byJobWork)
    if (duplicate) {
      setSaveError(duplicate)
      return
    }
    // Standard is required; a blank Upper/Lower Tolerance is saved as null
    // and means no allowance on that side (quality result treats it as 0).
    // Gauge (048): no Standard / tolerances -- OK / Not OK at inspection.
    if (!isGauge && String(form.standard ?? '').trim() === '') {
      setSaveError('Standard is required.')
      return
    }
    const numberError = isGauge ? null :
      validateNumber(form.standard, { label: 'Standard', max: 1000000000 }) ??
      validateNumber(form.upper_tolerance, { label: 'Upper Tolerance', ...NUMBER_RULES.NON_NEGATIVE }) ??
      validateNumber(form.lower_tolerance, { label: 'Lower Tolerance', ...NUMBER_RULES.NON_NEGATIVE })
    if (numberError) {
      setSaveError(numberError)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      // Shared with "Add Multiple Parameters" (utils/qualityBulk.js)
      const payload = buildPayload(form, form, { categoryOn, jobWorkOn, checkTypeOn, gaugeStandardOn })
      if (mode === 'edit') await updateQualityParameter(form.id, payload)
      else await createQualityParameter(payload)
      await refresh()
      setMode('view')
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleDelete() {
    if (!form.id) return
    del.ask({ recordType: 'quality parameter', label: recordLabel(form.part_serial_number, `${form.quality_parameter}${appliesToLabel(form) ? ` (${appliesToLabel(form)})` : ''}`), run: doDelete })
  }

  async function doDelete() {
    if (!form.id) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteQualityParameter(form.id)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExportExcel() {
    exportToCsv(listColumns, filteredRecords, 'quality_master.csv')
  }

  function handleExportPdf() {
    exportToPdf(listColumns, filteredRecords, 'Quality Master', 'quality_master')
  }

  const filteredRecords = displayRecords.filter((row) => {
    if (!listSearch) return true
    const query = listSearch.toLowerCase()
    return listColumns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(query))
  })
  const readOnly = mode === 'view'

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Quality Master" subtitle="Define numeric and text-based inspection standards" />
      <ActionToolbar
        onNew={() => guardLeave(handleNew)}
        onSave={bulk ? () => bulkApi.current?.save() : handleSave}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClear={handleClear}
        canSave={bulk || (!readOnly && !saving)}
        canEdit={!bulk && mode === 'view'}
        canDelete={!bulk && mode !== 'new' && !saving}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {(saveError || error) && (
          <Banner tone="error" message={saveError || error} />
        )}
        <div className="flex justify-end">
          {bulk ? (
            <button type="button" onClick={() => guardLeave(handleNew)} className="inline-flex items-center gap-1 h-8 rounded border border-gray-300 bg-white px-3 text-xs text-[#1F3A5F]">
              <ArrowLeft size={14} /> Back to single parameter
            </button>
          ) : (
            <button type="button" onClick={openBulk} className="inline-flex items-center gap-1 h-8 rounded bg-[#1F3A5F] px-3 text-xs text-white">
              <ListPlus size={14} /> Add Multiple Parameters
            </button>
          )}
        </div>
        {bulk ? (
          <QualityBulkEntry
            apiRef={bulkApi}
            records={records}
            products={products}
            machines={machines}
            cycleTimes={cycleTimes}
            jobWorkTypes={jobWorkTypes}
            flags={{ categoryOn: !!categoryOn, jobWorkOn, checkTypeOn, gaugeStandardOn }}
            onSaved={refresh}
          />
        ) : (
        <FormSection icon={ShieldCheck} title="1. Quality Parameter Details" subtitle="Route-specific inspection criteria" columns={3}>
          <Field label="Part Serial Number" required>
            <SearchableSelect value={form.part_serial_number} onChange={handlePartChange} disabled={readOnly} options={productOptions(products)} />
          </Field>
          <Field label="Part Name"><AutoFillBox value={selectedProduct?.part_name} /></Field>
          <Field label="Part Drawing Number"><AutoFillBox value={selectedProduct?.part_drawing_reference_number} /></Field>
          <Field label="UoM"><AutoFillBox value={selectedProduct?.unit_of_measurement} /></Field>
          {categoryOn && (
            <Field label="Applies To" required>
              <div className="flex items-center gap-4 h-8 text-xs" role="radiogroup" aria-label="Applies To">
                {[['category', 'Machine Category'], ['machine', 'Specific Machine'], ...(jobWorkOn ? [['jobwork', 'Job Work']] : [])].map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-1.5">
                    <input type="radio" name="qm-applies-to" value={value} checked={form.applies_to === value} onChange={() => handleAppliesTo(value)} disabled={readOnly} />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
          )}
          {byJobWork ? (
            <Field label="Job Work" required>
              <SearchableSelect
                value={form.job_work_code}
                onChange={handleJobWorkChange}
                disabled={readOnly}
                options={jobWorkTypes.map((j) => ({ value: j.job_work_code, label: `${j.type_of_job_work} (${j.job_work_code})` }))}
              />
            </Field>
          ) : byCategory ? (
            <Field label="Machine Category" required>
              <SearchableSelect value={form.machine_category} onChange={handleCategoryChange} disabled={readOnly} options={categories} />
            </Field>
          ) : (
            <Field label="Machine" required>
              <SearchableSelect value={form.machine_id} onChange={handleMachineChange} disabled={readOnly} options={machines.map((machine) => ({ value: machine.machine_id, label: machineOptionLabel(machine) }))} />
            </Field>
          )}
          <Field label="Type of Operation" required>
            <SearchableSelect value={form.type_of_operation} onChange={handleField('type_of_operation')} disabled={readOnly || operations.length === 0} options={operations} />
          </Field>
          <Field label="Quality Parameter" required>
            <TextInput list="quality-parameter-suggestions" value={form.quality_parameter} onChange={handleField('quality_parameter')} disabled={readOnly} />
            <datalist id="quality-parameter-suggestions">
              {parameterSuggestions.map((name) => <option key={name} value={name} />)}
            </datalist>
          </Field>
          {checkTypeOn && !byJobWork && (
            <Field label="Check Type" required>
              <SelectInput value={form.check_type || 'Measured'} onChange={handleField('check_type')} disabled={readOnly || hasReadings} options={['Measured', 'Gauge']} />
              {hasReadings && (
                <span className="mt-0.5 block text-[11px] text-gray-500" data-testid="check-type-locked">
                  Has readings -- add a new parameter instead
                </span>
              )}
            </Field>
          )}
          {(checkTypeOn || byJobWork) && (
            <Field label="Instrument"><TextInput value={form.gauge_ref ?? ''} onChange={handleField('gauge_ref')} disabled={readOnly} /></Field>
          )}
          {isGauge ? (
            <>
              {gaugeStandardOn && (
                <Field label="Standard">
                  <TextInput value={form.gauge_standard ?? ''} onChange={handleField('gauge_standard')} disabled={readOnly} placeholder="e.g. M8x1.25 6H" />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="Standard" required><TextInput type="number" value={inputValue(form.standard)} onChange={handleField('standard')} disabled={readOnly} /></Field>
              <Field label="Upper Tolerance"><TextInput type="number" value={inputValue(form.upper_tolerance)} onChange={handleField('upper_tolerance')} disabled={readOnly} /></Field>
              <Field label="Lower Tolerance"><TextInput type="number" value={inputValue(form.lower_tolerance)} onChange={handleField('lower_tolerance')} disabled={readOnly} /></Field>
            </>
          )}
          <Field label="Remarks" width="long"><TextInput value={form.remarks} onChange={handleField('remarks')} disabled={readOnly} /></Field>
        </FormSection>
        )}

        <RecordsList
          title="Quality Master List"
          columns={listColumns}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="id"
          selectedKey={form.id}
          onRowClick={(row) => guardLeave(() => handleRowClick(row))}
          searchValue={listSearch}
          onSearchChange={setListSearch} searchPlaceholder="Search quality parameters..."
        />
      </div>
      {del.dialog}
      <ConfirmDialog
        open={!!pendingLeave}
        title="Discard the typed parameters?"
        body="The rows in Add Multiple Parameters have not been saved and will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => pendingLeave?.()}
        onClose={() => setPendingLeave(null)}
      />
    </div>
  )
}
