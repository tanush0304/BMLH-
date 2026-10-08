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
} from '../../data/queries/qualityParameters'
import { listCycleTimes } from '../../data/queries/cycleTimes'
import { listProducts } from '../../data/queries/products'
import { listMachines } from '../../data/queries/machines'
import { machineOptionLabel } from '../../utils/machineLabel'

const EMPTY_FORM = {
  id: '',
  part_serial_number: '',
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
  { key: 'machine_label', label: 'Machine' },
  { key: 'type_of_operation', label: 'Type of Operation' },
  { key: 'quality_parameter', label: 'Quality Parameter' },
  { key: 'standard', label: 'Standard' },
  { key: 'upper_tolerance', label: 'Upper Tolerance' },
  { key: 'lower_tolerance', label: 'Lower Tolerance' },
  { key: 'expected_text_value', label: 'Expected Text Value' },
  { key: 'remarks', label: 'Remarks' },
]

function inputValue(value) {
  return value ?? ''
}

export default function QualityMaster() {
  const [records, setRecords] = useState([])
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
  const operations = [...new Set(cycleTimes
    .filter((row) => row.part_serial_number === form.part_serial_number && row.machine_id === form.machine_id)
    .map((row) => row.operation)
    .filter(Boolean))]
  const parameterSuggestions = [...new Set(records.map((row) => row.quality_parameter).filter(Boolean))]
  const displayRecords = useMemo(() => records.map((row) => ({
    ...row,
    part_name: products.find((product) => product.part_serial_number === row.part_serial_number)?.part_name ?? '',
    machine_label: machines.find((machine) => machine.machine_id === row.machine_id)
      ? machineOptionLabel(machines.find((machine) => machine.machine_id === row.machine_id))
      : row.machine_id ?? '',
  })), [records, products, machines])

  function handleField(key) {
    return (e) => setForm((current) => ({ ...current, [key]: e.target.value }))
  }

  function handlePartChange(e) {
    setForm((current) => ({ ...current, part_serial_number: e.target.value, type_of_operation: '' }))
  }

  function handleMachineChange(e) {
    setForm((current) => ({ ...current, machine_id: e.target.value, type_of_operation: '' }))
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
    setForm({ ...EMPTY_FORM, ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ''])) })
    setMode('view')
    setSaveError(null)
  }

  function handleEdit() {
    if (!form.id) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.part_serial_number || !form.machine_id || !form.type_of_operation || !form.quality_parameter.trim()) {
      setSaveError('Part Serial Number, Machine, Type of Operation and Quality Parameter are required.')
      return
    }
    const hasNumbers = [form.standard, form.upper_tolerance, form.lower_tolerance].some((value) => value !== '')
    const hasTextValue = Boolean(form.expected_text_value.trim())
    if (hasNumbers === hasTextValue) {
      setSaveError('Enter numeric standard/tolerance values or an Expected Text Value, but not both.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        part_serial_number: form.part_serial_number,
        machine_id: form.machine_id,
        type_of_operation: form.type_of_operation,
        quality_parameter: form.quality_parameter.trim(),
        standard: form.standard === '' ? null : Number(form.standard),
        upper_tolerance: form.upper_tolerance === '' ? null : Number(form.upper_tolerance),
        lower_tolerance: form.lower_tolerance === '' ? null : Number(form.lower_tolerance),
        expected_text_value: form.expected_text_value.trim() || null,
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

  async function handleDelete() {
    if (!form.id) return
    if (!confirm(`Delete this quality parameter (id ${form.id})? This cannot be undone.`)) return
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
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{saveError || error}</div>
        )}
        <FormSection icon={ShieldCheck} title="1. Quality Parameter Details" subtitle="Route-specific inspection criteria" columns={3}>
          <Field label="Part Serial Number" required>
            <SearchableSelect value={form.part_serial_number} onChange={handlePartChange} disabled={readOnly} options={productOptions(products)} />
          </Field>
          <Field label="Part Name"><AutoFillBox value={selectedProduct?.part_name} /></Field>
          <Field label="Machine" required>
            <SearchableSelect value={form.machine_id} onChange={handleMachineChange} disabled={readOnly} options={machines.map((machine) => ({ value: machine.machine_id, label: machineOptionLabel(machine) }))} />
          </Field>
          <Field label="Type of Operation" required>
            <SearchableSelect value={form.type_of_operation} onChange={handleField('type_of_operation')} disabled={readOnly || operations.length === 0} options={operations} />
          </Field>
          <Field label="Quality Parameter" required>
            <TextInput list="quality-parameter-suggestions" value={form.quality_parameter} onChange={handleField('quality_parameter')} disabled={readOnly} />
            <datalist id="quality-parameter-suggestions">
              {parameterSuggestions.map((name) => <option key={name} value={name} />)}
            </datalist>
          </Field>
          <Field label="Standard"><TextInput type="number" value={inputValue(form.standard)} onChange={handleField('standard')} disabled={readOnly} /></Field>
          <Field label="Upper Tolerance"><TextInput type="number" value={inputValue(form.upper_tolerance)} onChange={handleField('upper_tolerance')} disabled={readOnly} /></Field>
          <Field label="Lower Tolerance"><TextInput type="number" value={inputValue(form.lower_tolerance)} onChange={handleField('lower_tolerance')} disabled={readOnly} /></Field>
          <Field label="Expected Text Value"><TextInput value={form.expected_text_value} onChange={handleField('expected_text_value')} disabled={readOnly} placeholder="e.g. 10 x 36 Deg or In Position" /></Field>
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
    </div>
  )
}
