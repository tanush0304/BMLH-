import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import { productOptions } from '../../utils/productOptions'
import RecordsList from '../../components/RecordsList'
import {
  listQualityParameters,
  createQualityParameter,
  updateQualityParameter,
  deleteQualityParameter,
  qualityCategorySupported,
} from '../../data/queries/qualityParameters'
import { categoryOptions, operationsForTarget, appliesToLabel, isCategoryRow, normCategory } from '../../utils/qualityMatch'
import { listCycleTimes } from '../../data/queries/cycleTimes'
import { listProducts } from '../../data/queries/products'
import { listMachines } from '../../data/queries/machines'
import { machineOptionLabel } from '../../utils/machineLabel'
import { toNumberOrNull, validateNumber, NUMBER_RULES } from '../../utils/numericFields'
import Banner from '../../components/Banner'
import { useDeleteConfirm, recordLabel } from '../../components/ConfirmDialog'

const EMPTY_FORM = {
  id: '',
  part_serial_number: '',
  applies_to: 'category', // 'category' | 'machine' (044; before it always 'machine')
  machine_category: '',
  machine_id: '',
  type_of_operation: '',
  quality_parameter: '',
  standard: '',
  upper_tolerance: '',
  lower_tolerance: '',
  expected_text_value: '',
  remarks: '',
}

const LIST_COLUMNS = [
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'part_drawing_reference_number', label: 'Part Drawing Number' },
  { key: 'machine_label', label: 'Applies To' },
  { key: 'type_of_operation', label: 'Type of Operation' },
  { key: 'quality_parameter', label: 'Quality Parameter' },
  { key: 'standard', label: 'Standard' },
  { key: 'upper_tolerance', label: 'Upper Tolerance' },
  { key: 'lower_tolerance', label: 'Lower Tolerance' },
  { key: 'unit_of_measurement', label: 'UoM' },
  { key: 'remarks', label: 'Remarks' },
]

/** Same part + operation + target (machine or category) + parameter name already saved. */
export function duplicateParameter(records, form, byCategory) {
  const name = form.quality_parameter.trim().toLowerCase()
  const clash = records.find((r) =>
    String(r.id) !== String(form.id || '') &&
    r.part_serial_number === form.part_serial_number &&
    (r.type_of_operation ?? '') === form.type_of_operation &&
    String(r.quality_parameter ?? '').trim().toLowerCase() === name &&
    (byCategory
      ? isCategoryRow(r) && normCategory(r.machine_category) === normCategory(form.machine_category)
      : r.machine_id === form.machine_id))
  if (!clash) return null
  const where = byCategory ? `${form.machine_category.trim()} (all)` : form.machine_id
  return `${String(clash.quality_parameter).trim()} is already defined for ${form.part_serial_number} – ${form.type_of_operation} on ${where} -- edit it instead.`
}

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
  // 044 run? null = not known yet (treated as "no": the old form).
  const [categoryOn, setCategoryOn] = useState(null)
  const byCategory = !!categoryOn && form.applies_to === 'category'

  useEffect(() => {
    let active = true
    qualityCategorySupported().then((ok) => { if (active) setCategoryOn(ok) })
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
  const operations = operationsForTarget({
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
    part_name: product?.part_name ?? '',
    part_drawing_reference_number: product?.part_drawing_reference_number ?? '',
    unit_of_measurement: product?.unit_of_measurement ?? '',
    machine_label: appliesToLabel(row, (id) => {
      const m = machines.find((machine) => machine.machine_id === id)
      return m ? machineOptionLabel(m) : id
    }),
    }
  }), [records, products, machines])

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
    setForm((current) => ({ ...current, applies_to: value, machine_id: '', machine_category: '', type_of_operation: '' }))
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    handleNew()
  }

  function handleRowClick(row) {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ''])),
      applies_to: isCategoryRow(row) ? 'category' : 'machine',
    })
    setMode('view')
    setSaveError(null)
  }

  function handleEdit() {
    if (!form.id) return
    setMode('edit')
  }

  async function handleSave() {
    const target = byCategory ? form.machine_category.trim() : form.machine_id
    if (!form.part_serial_number || !target || !form.type_of_operation || !form.quality_parameter.trim()) {
      setSaveError(`Part Serial Number, ${byCategory ? 'Machine Category' : 'Machine'}, Type of Operation and Quality Parameter are required.`)
      return
    }
    const duplicate = duplicateParameter(records, form, byCategory)
    if (duplicate) {
      setSaveError(duplicate)
      return
    }
    // Standard is required; a blank Upper/Lower Tolerance is saved as null
    // and means no allowance on that side (quality result treats it as 0).
    if (String(form.standard ?? '').trim() === '') {
      setSaveError('Standard is required.')
      return
    }
    const numberError =
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
      const payload = {
        part_serial_number: form.part_serial_number,
        machine_id: byCategory ? null : form.machine_id,
        ...(categoryOn ? { machine_category: byCategory ? form.machine_category.trim() : null } : {}),
        type_of_operation: form.type_of_operation,
        quality_parameter: form.quality_parameter.trim(),
        standard: toNumberOrNull(form.standard),
        upper_tolerance: toNumberOrNull(form.upper_tolerance),
        lower_tolerance: toNumberOrNull(form.lower_tolerance),
        expected_text_value: null,
        remarks: form.remarks.trim() || null,
      }
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
    exportToCsv(LIST_COLUMNS, filteredRecords, 'quality_master.csv')
  }

  function handleExportPdf() {
    exportToPdf(LIST_COLUMNS, filteredRecords, 'Quality Master', 'quality_master')
  }

  const filteredRecords = displayRecords.filter((row) => {
    if (!listSearch) return true
    const query = listSearch.toLowerCase()
    return LIST_COLUMNS.some((column) => String(row[column.key] ?? '').toLowerCase().includes(query))
  })
  const readOnly = mode === 'view'

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Quality Master" subtitle="Define numeric and text-based inspection standards" />
      <ActionToolbar
        onNew={handleNew}
        onSave={handleSave}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClear={handleClear}
        canSave={!readOnly && !saving}
        canEdit={mode === 'view'}
        canDelete={mode !== 'new' && !saving}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {(saveError || error) && (
          <Banner tone="error" message={saveError || error} />
        )}
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
                {[['category', 'Machine Category'], ['machine', 'Specific Machine']].map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-1.5">
                    <input type="radio" name="qm-applies-to" value={value} checked={form.applies_to === value} onChange={() => handleAppliesTo(value)} disabled={readOnly} />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
          )}
          {byCategory ? (
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
          <Field label="Standard" required><TextInput type="number" value={inputValue(form.standard)} onChange={handleField('standard')} disabled={readOnly} /></Field>
          <Field label="Upper Tolerance"><TextInput type="number" value={inputValue(form.upper_tolerance)} onChange={handleField('upper_tolerance')} disabled={readOnly} /></Field>
          <Field label="Lower Tolerance"><TextInput type="number" value={inputValue(form.lower_tolerance)} onChange={handleField('lower_tolerance')} disabled={readOnly} /></Field>
          <Field label="Remarks" width="long"><TextInput value={form.remarks} onChange={handleField('remarks')} disabled={readOnly} /></Field>
        </FormSection>

        <RecordsList
          title="Quality Master List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="id"
          selectedKey={form.id}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch} searchPlaceholder="Search quality parameters..."
        />
      </div>
      {del.dialog}
    </div>
  )
}
