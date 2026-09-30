import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listQualityParameters,
  createQualityParameter,
  updateQualityParameter,
  deleteQualityParameter,
} from '../../data/queries/qualityParameters'
import { listProducts } from '../../data/queries/products'
import { listMachines } from '../../data/queries/machines'

const EMPTY_FORM = {
  id: '',
  product_code: '',
  quality_parameter: '',
  machine_id: '',
  type_of_operation: '',
  standard: '',
  upper_tolerance: '',
  lower_tolerance: '',
  remarks: '',
}

const LIST_COLUMNS = [
  { key: 'product_code', label: 'Product Code' },
  { key: 'quality_parameter', label: 'Parameter' },
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'standard', label: 'Standard' },
  { key: 'upper_tolerance', label: 'Upper Tol.' },
  { key: 'lower_tolerance', label: 'Lower Tol.' },
]

export default function QualityMaster() {
  const [records, setRecords] = useState([])
  const [products, setProducts] = useState([])
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [params, prods, machs] = await Promise.all([
        listQualityParameters(),
        listProducts(),
        listMachines(),
      ])
      setRecords(params)
      setProducts(prods)
      setMachines(machs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
  }

  function handleRowClick(row) {
    setForm({ ...EMPTY_FORM, ...row })
    setMode('view')
    setSaveError(null)
  }

  function handleEdit() {
    if (!form.id) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.quality_parameter) {
      setSaveError('Quality Parameter is required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        product_code: form.product_code || null,
        quality_parameter: form.quality_parameter,
        machine_id: form.machine_id || null,
        type_of_operation: form.type_of_operation || null,
        standard: form.standard === '' ? null : Number(form.standard),
        upper_tolerance: form.upper_tolerance === '' ? null : Number(form.upper_tolerance),
        lower_tolerance: form.lower_tolerance === '' ? null : Number(form.lower_tolerance),
        remarks: form.remarks || null,
      }
      if (mode === 'edit') {
        await updateQualityParameter(form.id, payload)
      } else {
        await createQualityParameter(payload)
      }
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

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return (
      r.product_code?.toLowerCase().includes(q) || r.quality_parameter?.toLowerCase().includes(q)
    )
  })

  const readOnly = mode === 'view'

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        title="Quality Master"
        subtitle="Manage Quality Parameters  |  Standards & Tolerances"
      />
      <ActionToolbar
        onNew={handleNew}
        onSave={handleSave}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClear={handleClear}
        canSave={!readOnly && !saving}
        canEdit={mode === 'view'}
        canDelete={mode !== 'new' && !saving}
        searchValue={toolbarSearch}
        onSearchChange={setToolbarSearch}
        onSearch={handleToolbarSearch}
        searchPlaceholder="Search by Product Code / Parameter..."
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <FormSection icon={ShieldCheck} title="1. Quality Parameter Details" subtitle="Standard and tolerance" columns={3}>
          <Field label="Product Code">
            <SelectInput
              value={form.product_code}
              onChange={handleField('product_code')}
              disabled={readOnly}
              options={products.map((p) => p.product_code)}
            />
          </Field>
          <Field label="Quality Parameter" required>
            <TextInput
              value={form.quality_parameter}
              onChange={handleField('quality_parameter')}
              disabled={readOnly}
            />
          </Field>
          <Field label="Machine">
            <SelectInput
              value={form.machine_id}
              onChange={handleField('machine_id')}
              disabled={readOnly}
              options={machines.map((m) => m.machine_id)}
            />
          </Field>
          <Field label="Type of Operation">
            <TextInput
              value={form.type_of_operation}
              onChange={handleField('type_of_operation')}
              disabled={readOnly}
            />
          </Field>
          <Field label="Standard">
            <TextInput type="number" value={form.standard} onChange={handleField('standard')} disabled={readOnly} />
          </Field>
          <Field label="Upper Tolerance">
            <TextInput
              type="number"
              value={form.upper_tolerance}
              onChange={handleField('upper_tolerance')}
              disabled={readOnly}
            />
          </Field>
          <Field label="Lower Tolerance">
            <TextInput
              type="number"
              value={form.lower_tolerance}
              onChange={handleField('lower_tolerance')}
              disabled={readOnly}
            />
          </Field>
          <Field label="Remarks" width="long">
            <TextInput value={form.remarks} onChange={handleField('remarks')} disabled={readOnly} />
          </Field>
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
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
